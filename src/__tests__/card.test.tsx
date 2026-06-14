import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

describe("Card", () => {
  it("renders card with content", () => {
    render(<Card>内容</Card>)
    expect(screen.getByText("内容")).toBeInTheDocument()
  })

  it("renders card with header, title, description", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>标题</CardTitle>
          <CardDescription>描述文字</CardDescription>
        </CardHeader>
        <CardContent>主要内容</CardContent>
        <CardFooter>底部</CardFooter>
      </Card>
    )
    expect(screen.getByText("标题")).toBeInTheDocument()
    expect(screen.getByText("描述文字")).toBeInTheDocument()
    expect(screen.getByText("主要内容")).toBeInTheDocument()
    expect(screen.getByText("底部")).toBeInTheDocument()
  })

  it("renders borderless variant", () => {
    render(<Card borderless>无边框</Card>)
    const card = screen.getByText("无边框")
    expect(card.className).toContain("bg-transparent")
  })
})
