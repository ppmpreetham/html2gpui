import type { Transform } from "codemod:ast-grep"
import type TSX from "codemod:ast-grep/langs/tsx"
import { tailwindCSS } from "../consts/tailwind.ts"
import { textSizes } from "../consts/miniclasses.ts"

const TAILWIND_SET = new Set(tailwindCSS)
const usedTags = new Set<string>()

function transformTailwindToGpui(token: string): string {
  let result = token

  // (-w-4 -> w_neg_4)
  if (result.startsWith("-")) {
    const parts = result.slice(1).split("-")
    const prefix = parts.shift()
    result = `${prefix}_neg_${parts.join("_")}`
  }

  return result
    .replace(/\//g, "_") // 1/2 -> 1_2
    .replace(/\./g, "p") // 0.5 -> 0p5
    .replace(/-/g, "_") // rest -> underscores
}

function classifyToken(token: string): string {
  const parts = token.split("-")

  // text Sizes
  if (token.startsWith("text-") && textSizes.includes(parts[parts.length - 1] ?? "")) {
    return `.${transformTailwindToGpui(token)}()`
  }

  // colors (bg, text, border)
  const colorMatch = token.match(/^(bg|text|border)-(.*)$/)
  if (colorMatch) {
    const [_, type = "", value = ""] = colorMatch
    const method = type === "text" ? "text_color" : type === "bg" ? "bg" : "border_color"

    if (value.startsWith("[#") && value.endsWith("]")) {
      const hex = value.slice(2, -1).toUpperCase()
      return `.${method}(rgb(0x${hex}))`
    }
    if (["white", "black", "transparent"].includes(value)) {
      return `.${method}(${value}())`
    }
    // transformation to the color value ( slate-500 -> slate_500)
    return `.${method}(gpui::${transformTailwindToGpui(value)}())`
  }

  // others (w-[20px])
  const arbMatch = token.match(/^([a-z-]+)-\[(\d+)(?:px)?\]$/)
  if (arbMatch) {
    const [_, prefix = "", num = ""] = arbMatch
    return `.${transformTailwindToGpui(prefix)}(px(${num}.0))`
  }

  if (TAILWIND_SET.has(token)) {
    return `.${transformTailwindToGpui(token)}()`
  }

  if (token === "border") return ".border_1()"
  return `// Unknown: ${token}`
}

function getJsxChildren(node: any) {
  if (node.kind() === "jsx_self_closing_element") return []
  const children: any[] = []
  for (const child of node.children() || []) {
    const k = child.kind()
    if (
      [
        "jsx_text",
        "jsx_element",
        "jsx_self_closing_element",
        "jsx_expression",
        "jsx_fragment",
      ].includes(k)
    ) {
      children.push(child)
    }
  }
  return children
}

function extractAttributes(node: any): Record<string, string> {
  const attrs: Record<string, string> = {}
  const found = node.findAll({ rule: { kind: "jsx_attribute" } })
  for (const attr of found) {
    const nameNode = attr.child(0)
    const valueNode = attr.child(2)
    if (nameNode && valueNode) {
      const val = valueNode.text().replace(/^["'{`]|["'}`]$/g, "")
      attrs[nameNode.text()] = val
    }
  }
  return attrs
}

interface UiNode {
  kind: "element" | "text" | "expression"
  tag?: string
  styles?: string[]
  value?: string
  isTemplate?: boolean
  children?: UiNode[]
}

function buildIR(node: any): UiNode | null {
  const k = node.kind()

  if (k === "jsx_element" || k === "jsx_self_closing_element") {
    const attrs = extractAttributes(node)
    const rawClass = attrs["className"] || attrs["class"] || ""
    const styles = rawClass.split(/\s+/).filter(Boolean).map(classifyToken)

    const tag =
      node
        .child(0)
        ?.findAll({ rule: { kind: "identifier" } })[0]
        ?.text() || "div"
    usedTags.add(tag)

    const children: UiNode[] = []
    if (k === "jsx_element") {
      const body = node.children().slice(1, -1)
      for (const child of body) {
        const built = buildIR(child)
        if (built) children.push(built)
      }
    }
    return { kind: "element", tag, styles, children }
  }

  if (k === "jsx_text") {
    const txt = node.text().trim()
    return txt ? { kind: "text", value: txt } : null
  }

  if (k === "jsx_expression") {
    const content = node
      .text()
      .replace(/^\{|\}$/g, "")
      .trim()
    const isTemplate = content.startsWith("`") || content.includes("${")
    return { kind: "expression", value: content, isTemplate }
  }

  return null
}

function generateRust(node: UiNode, depth: number): string {
  const childIndent = "    ".repeat(depth + 1)
  if (node.kind === "text") return `"${node.value ?? ""}"`
  if (node.kind === "expression") {
    const val = node.value ?? ""
    if (node.isTemplate) {
      const raw = val.replace(/^`|`$/g, "")
      const parts = raw.split(/\$\{(.*?)\}/)
      let fmtStr = ""
      const args: string[] = []
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i] ?? ""
        if (i % 2 === 0) fmtStr += p
        else {
          fmtStr += "{}"
          args.push(`&${p.trim()}`)
        }
      }
      return `format!("${fmtStr}", ${args.join(", ")})`
    }
    return val
  }

  const tag = `${node.tag ?? "div"}()`
  const styles = node.styles ?? []
  const styleChain = styles.length > 0 ? styles.join(`\n${childIndent}`) : ""
  let rust = styleChain ? `${tag}\n${childIndent}${styleChain}` : tag

  for (const child of node.children ?? []) {
    rust += `\n${childIndent}.child(${generateRust(child, depth + 1)})`
  }
  return rust
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root()
  const allJsx = rootNode.findAll({
    rule: { pattern: "$JSX" },
    constraints: {
      JSX: {
        any: [{ kind: "jsx_element" }, { kind: "jsx_self_closing_element" }],
      },
    },
  })

  usedTags.clear()
  const edits: any[] = []

  for (const jsx of allJsx) {
    const parent = jsx.parent()
    const pKind = parent?.kind() || ""
    if (pKind === "jsx_element" || pKind === "jsx_expression") continue

    const ir = buildIR(jsx)
    if (ir) {
      const output = generateRust(ir, 1)
      edits.push(jsx.replace(output))
    }
  }
  const newCode = rootNode.commitEdits(edits)
  const imports = `use gpui::{${Array.from(usedTags).join(", ")}, rgb, px};\n\n`
  if (newCode.startsWith("// @ts-nocheck\n")) {
    return "// @ts-nocheck\n" + imports + newCode.substring("// @ts-nocheck\n".length)
  }

  return imports + newCode
}

export default transform
