import type { Transform } from "codemod:ast-grep"
import type TSX from "codemod:ast-grep/langs/tsx"

const transform: Transform<TSX> = async (root) => {
  const rootNode = root.root()

  const nodes = rootNode.findAll({
    rule: {
      pattern: "<$TAG className=$CLASS $$$*>$CONTENT</$TAG>",
    },
  })

  if (nodes.length === 0) return rootNode.text()

  const edits: any = []

  nodes.forEach((node) => {
    // const tag = node.getMatch("TAG")?.text() || "div"
    const tag = "div"
    const content = node.getMatch("CONTENT")?.text().trim() || ""

    const rawClass = node.getMatch("CLASS")?.text().replace(/['"]/g, "") || ""
    const gpuiMethods = rawClass
      .split(/\s+/)
      .filter(Boolean)
      .map((cls) => `.${cls.replace(/-/g, "_")}()`)
      .join("")

    const rustSnippet = `${tag}()${gpuiMethods}.child("${content}")`

    edits.push(node.replace(rustSnippet))
  })

  const newSource = rootNode.commitEdits(edits)
  return newSource
}

export default transform
