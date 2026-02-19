// @ts-nocheck
use gpui::{button, div, span, p, rgb, px};

const btn = button()
        .flex()
        .items_center()
        .gap_2()
        .px_4()
        .py_2()
        .bg(rgb(0x6C63FF))
        .rounded_lg()
        .text_color(white())
        .font_semibold()
        .child("Click me")

const card = (
    div()
        .flex()
        .flex_col()
        .gap_4()
        .p_4()
        .bg(rgb(0x1E1E2E))
        .rounded_lg()
        .w_full()
        .child(span()
            .text_sm()
            .font_semibold()
            .text_color(white())
            .child("Hello"))
)

const spacer = div()
        .size(px(500.0))
        .bg(rgb(0x505050))

const greeting = p()
        .text_lg()
        .child(format!("Hello {}", &name))