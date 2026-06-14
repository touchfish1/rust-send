import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Button } from "@/components/ui/button"

describe("Button", () => {
  it("renders with text", () => {
    render(<Button>发送</Button>)
    expect(screen.getByText("发送")).toBeInTheDocument()
  })

  it("renders with default variant", () => {
    render(<Button>默认</Button>)
    const btn = screen.getByText("默认")
    expect(btn.className).toContain("bg-primary")
  })

  it("renders with outline variant", () => {
    render(<Button variant="outline">边框</Button>)
    const btn = screen.getByText("边框")
    expect(btn.className).toContain("border-border")
  })

  it("renders with ghost variant", () => {
    render(<Button variant="ghost">幽灵</Button>)
    const btn = screen.getByText("幽灵")
    expect(btn.className).toContain("hover:bg-muted")
  })

  it("renders with destructive variant", () => {
    render(<Button variant="destructive">删除</Button>)
    const btn = screen.getByText("删除")
    expect(btn.className).toContain("bg-destructive")
  })

  it("shows loading state", () => {
    render(<Button loading>加载中</Button>)
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeTruthy()
    expect(screen.getByText("加载中")).toBeInTheDocument()
  })

  it("is disabled when loading", () => {
    render(<Button loading>加载中</Button>)
    const btn = screen.getByRole("button")
    expect(btn).toBeDisabled()
  })

  it("accepts custom className", () => {
    render(<Button className="custom-class">自定义</Button>)
    const btn = screen.getByText("自定义")
    expect(btn.className).toContain("custom-class")
  })
})
