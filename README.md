<p align="center">
<img src="/public/logo.jpg" alt="html2gpui Logo" height="170">
</p>

<h1 align="center">html2gpui</h1>

<div align="center">
Transpile React & Tailwind to native Rust GPUI instantly <br />
<code><strong>pnpx codemod html2gpui filename.html </strong></code>

</div>

<br />

## What is html2gpui?

**html2gpui** is a powerful codemod and transpilation tool designed to bridge the gap between web development and native Rust desktop apps. Under the hood, it uses the incredibly fast <a href="[https://ast-grep.github.io/](https://ast-grep.github.io/)">ast-grep</a> to parse your existing React/JSX code and automatically convert HTML tags and Tailwind CSS classes into idiomatic, type-safe <a href="[https://gpui.rs/](https://gpui.rs/)">GPUI</a> builder patterns.

Whether you are migrating an existing web dashboard to a native macOS app, or you just prefer designing your layouts in HTML/Tailwind before moving them to Rust, `html2gpui` does the heavy lifting for you.

## Get Started

Writing UI in Rust is incredibly powerful, but writing it in JSX is fast. `html2gpui` gives you the best of both worlds.

### Before (React / JSX)

```tsx
<>
  <div className="flex items-center gap-2 px-4 py-2 bg-[#6C63FF] rounded-lg text-white font-semibold">
    Click me
  </div>
  <div className="flex flex-col gap-4 p-4 bg-[#1E1E2E] rounded-lg w-full">
    <span className="text-sm font-semibold text-white">Hello</span>
  </div>
  <div className="size-[500px] bg-[#505050]" />
</>
```

### After (Rust / GPUI)

```rust
use gpui::{div, rgb, px};

div()
    .child(div()
        .flex()
        .items_center()
        .gap_2()
        .px_4()
        .py_2()
        .bg(rgb(0x6C63FF))
        .rounded_lg()
        .text_color(gpui::white())
        .font_semibold()
        .child("Click me"))
    .child(div()
        .flex()
        .flex_col()
        .gap_4()
        .p_4()
        .bg(rgb(0x1E1E2E))
        .rounded_lg()
        .w_full()
        .child(div()
            .text_sm()
            .font_semibold()
            .text_color(gpui::white())
            .child("Hello")))
    .child(div()
        .size(px(500.0))
        .bg(rgb(0x505050)))

```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ppmpreetham/html2gpui&type=date&legend=top-left)](https://www.star-history.com/#ppmpreetham/html2gpui&type=date&legend=top-left)

## Contributing

Ways to get involved:

- Star the repo and let us know what you're building with `html2gpui`.
- Create and participate in Github issues and discussions.
- Submit PRs for unmapped Tailwind classes, new GPUI components, or edge-case JSX structures.
