# html2gpui

Transpiles HTML to GPUI

## Installation

```bash
# Install from registry
codemod run html2gpui

# Or run locally
codemod run -w workflow.yaml
```

## Usage

This codemod transforms rust code by:

- Converting `var` declarations to `const`/`let`
- Removing debug statements
- Modernizing syntax patterns

## Development

```bash
# Test the transformation
npm test

# Validate the workflow
codemod validate -w workflow.yaml

# Publish to registry
codemod login
codemod publish
```

## License

MIT 