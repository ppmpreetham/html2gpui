import type { Transform } from "codemod:ast-grep"
import type TSX from "codemod:ast-grep/langs/tsx"
import {
  COLORS,
  ATTR_METHOD_MAP,
  TAG_DEFAULT_STYLES,
  VALID_TEXT_SIZES,
} from "../consts/compatibleclasses.ts"

let autoIdCounter = 0
const usedTags = new Set<string>()

function nextAutoId(tag: string): string {
  return `__rsx_${tag}_${autoIdCounter++}`
}

function isStatefulAttr(name: string): boolean {
  if (
    name.startsWith("on_") ||
    (name.startsWith("on") && name.length >= 3 && name[2] === name[2]?.toUpperCase())
  ) {
    return true
  }
  return ["hover", "active", "focus", "tooltip", "group", "track_focus"].includes(name)
}

function parseSingleClass(cls: string): string {
  const arbMatch = cls.match(/^([a-zA-Z0-9-]+)-\[([^\]]+)\]$/)
  if (arbMatch) {
    const prefix = (arbMatch[1] || "").replace(/-/g, "_")
    const val = arbMatch[2] || ""

    if (val.startsWith("#")) {
      let hex = val.slice(1)
      if (hex.length === 3)
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("")
      const method =
        prefix === "text"
          ? "text_color"
          : prefix === "bg"
            ? "bg"
            : prefix === "border"
              ? "border_color"
              : prefix
      return `.${method}(rgb(0x${hex.toUpperCase()}))`
    }

    if (val.endsWith("px")) {
      const num = val.slice(0, -2)
      const numStr = num.includes(".") ? num : `${num}.0`
      return `.${prefix}(px(${numStr}))`
    }
  }

  if (cls === "border") return ".border_1()"

  const colorMatch = cls.match(/^(bg|text|border|border-[trblxy])-([a-zA-Z0-9-]+)$/)
  if (colorMatch) {
    const type = colorMatch[1] || ""
    const value = colorMatch[2] || ""
    const method =
      type === "text"
        ? "text_color"
        : type === "bg"
          ? "bg"
          : type === "border"
            ? "border_color"
            : type.replace(/-/g, "_")
    const colorKey = value.replace(/-/g, "_")

    if (COLORS[colorKey]) {
      return `.${method}(rgb(0x${COLORS[colorKey].toUpperCase()}))`
    }
    if (["white", "black", "transparent", "red", "green", "blue", "yellow"].includes(colorKey)) {
      return `.${method}(gpui::${colorKey}())`
    }
  }

  // (-w-4 -> w_neg_4, w-1/2 -> w_1_2, w-0.5 -> w_0p5, etc)
  let result = cls
  if (result.startsWith("-")) {
    const parts = result.slice(1).split("-")
    const prefix = parts.shift() || ""
    result = `${prefix}_neg_${parts.join("_")}`
  }

  result = result.replace(/\//g, "_").replace(/\./g, "p").replace(/-/g, "_")

  if (result.startsWith("text_")) {
    const size = result.slice(5)
    if (VALID_TEXT_SIZES.includes(size) || size.match(/^[1-9]xl$/)) {
      return `.${result}()`
    }
  }

  return `.${result}()`
}

type AttributeValue =
  | { type: "flag" }
  | { type: "string"; value: string }
  | { type: "expression"; value: string }
  | { type: "tuple"; first: string; second: string }

interface UiNode {
  kind: "element" | "text" | "expression"
  tag?: string
  attributes?: Record<string, AttributeValue>
  classes?: string[]
  value?: string
  isTemplate?: boolean
  children?: UiNode[]
}

function getTag(node: any): string {
  const target = node.kind() === "jsx_element" ? node.child(0) : node
  for (const child of target.children() || []) {
    if (child.kind() === "identifier" || child.kind() === "nested_identifier") {
      return child.text()
    }
  }
  return "div"
}

function extractAttributes(node: any): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {}

  const targetNode = node.kind() === "jsx_element" ? node.child(0) : node
  if (!targetNode || targetNode.kind() === "jsx_fragment") return attrs

  for (const attr of targetNode.children() || []) {
    if (attr.kind() === "jsx_attribute") {
      const nameNode = attr.child(0)
      if (!nameNode) continue
      const name = nameNode.text()
      const valueNode = attr.child(2)

      if (!valueNode) {
        attrs[name] = { type: "flag" }
      } else if (valueNode.kind() === "jsx_expression") {
        const exprStr = valueNode
          .text()
          .replace(/^\{|\}$/g, "")
          .trim()

        if (
          (name === "when" || name === "whenSome") &&
          exprStr.startsWith("(") &&
          exprStr.endsWith(")")
        ) {
          const tupleBody = exprStr.slice(1, -1)
          const commaIdx = tupleBody.indexOf(",")
          if (commaIdx !== -1) {
            attrs[name] = {
              type: "tuple",
              first: tupleBody.slice(0, commaIdx).trim(),
              second: tupleBody.slice(commaIdx + 1).trim(),
            }
            continue
          }
        }
        attrs[name] = { type: "expression", value: exprStr }
      } else {
        attrs[name] = { type: "string", value: valueNode.text().replace(/^["'{`]|["'}`]$/g, "") }
      }
    }
  }
  return attrs
}

function buildIR(node: any): UiNode | null {
  const k = node.kind()

  if (k === "jsx_element" || k === "jsx_self_closing_element") {
    const attrs = extractAttributes(node)

    const rawClassAttr = attrs["className"] || attrs["class"]
    const classes: string[] = []
    if (rawClassAttr && rawClassAttr.type === "string") {
      classes.push(...rawClassAttr.value.split(/\s+/).filter(Boolean))
    }
    delete attrs["className"]
    delete attrs["class"]

    let tag = getTag(node)
    const originalTag = tag

    const htmlTags = [
      "div",
      "span",
      "section",
      "article",
      "header",
      "footer",
      "main",
      "nav",
      "aside",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "label",
      "a",
      "button",
      "input",
      "textarea",
      "select",
      "form",
      "ul",
      "ol",
      "li",
    ]
    if (htmlTags.includes(tag)) tag = "div"
    usedTags.add(tag)

    const children: UiNode[] = []
    if (k === "jsx_element") {
      // ignore opening & closing tags
      const body = node.children().slice(1, -1)
      for (const child of body) {
        const built = buildIR(child)
        if (built) children.push(built)
      }
    }

    return { kind: "element", tag, attributes: attrs, classes, children, value: originalTag }
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

  const tag = node.tag ?? "div"
  const attrs = node.attributes ?? {}
  const classes = node.classes ?? []
  const originalTag = node.value ?? tag

  let userId = null
  let hasStyled = false
  let needsId = false

  for (const [name, attr] of Object.entries(attrs)) {
    if (name === "id" && attr.type === "string") {
      userId = `"${attr.value}"`
    } else if (name === "id" && attr.type === "expression") {
      userId = attr.value
    } else if (name === "styled" && attr.type === "flag") {
      hasStyled = true
    } else {
      if (!needsId) {
        needsId = isStatefulAttr(ATTR_METHOD_MAP[name] || name)
      }
    }
  }

  let rustCode = `${tag}()`
  if (userId) {
    rustCode += `.id(${userId})`
  } else if (needsId) {
    rustCode += `.id("${nextAutoId(originalTag)}")`
  }

  const methods: string[] = []

  if (hasStyled && TAG_DEFAULT_STYLES[originalTag]) {
    const defaultClasses = TAG_DEFAULT_STYLES[originalTag].split(" ")
    methods.push(...defaultClasses.map(parseSingleClass))
  }

  methods.push(...classes.map(parseSingleClass))

  for (const [name, attr] of Object.entries(attrs)) {
    if (name === "id" || name === "styled") continue

    if (name === "invisible" && attr.type === "flag") {
      methods.push(".visible(false)")
      continue
    }

    if (name === "when" || name === "whenSome") {
      if (attr.type === "tuple") {
        const method = name === "whenSome" ? "when_some" : "when"
        methods.push(`.${method}(${attr.first}, ${attr.second})`)
      }
      continue
    }

    const mappedName = ATTR_METHOD_MAP[name] || name

    if (attr.type === "flag") {
      methods.push(`.${mappedName}()`)
    } else if (attr.type === "string") {
      methods.push(`.${mappedName}("${attr.value}")`)
    } else if (attr.type === "expression") {
      methods.push(`.${mappedName}(${attr.value})`)
    }
  }

  if (methods.length > 0) {
    rustCode += `\n${childIndent}${methods.join(`\n${childIndent}`)}`
  }

  const children = node.children ?? []
  let i = 0

  while (i < children.length) {
    const consecutiveExprs: string[] = []

    while (i < children.length) {
      const node = children[i]
      if (!node) break

      if (node.kind === "expression" || node.kind === "text") {
        consecutiveExprs.push(generateRust(node, depth))
        i++
      } else {
        break
      }
    }

    if (consecutiveExprs.length >= 2) {
      rustCode += `\n${childIndent}.children([${consecutiveExprs.join(", ")}])`
    } else {
      for (const expr of consecutiveExprs) {
        rustCode += `\n${childIndent}.child(${expr})`
      }
    }

    if (i < children.length) {
      const node = children[i]
      if (node) {
        rustCode += `\n${childIndent}.child(${generateRust(node, depth + 1)})`
        i++
      }
    }
  }

  return rustCode
}

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root()

  const allJsx = rootNode.findAll({
    rule: {
      any: [{ kind: "jsx_element" }, { kind: "jsx_self_closing_element" }],
    },
  })

  autoIdCounter = 0
  usedTags.clear()
  const edits: any[] = []

  for (const jsx of allJsx) {
    const pKind = jsx.parent()?.kind() || ""

    if (["jsx_element", "jsx_expression"].includes(pKind)) continue

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
