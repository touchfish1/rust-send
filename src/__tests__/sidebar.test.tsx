import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Sidebar } from "@/components/layout/sidebar"

const onSelectDevice = vi.fn()
const onNavigate = vi.fn()

describe("Sidebar", () => {
  it("renders online and recent devices in separate groups", () => {
    render(
      <Sidebar
        localName="rust-send"
        connectionStatus="relay"
        devices={[
          {
            id: "online-1",
            name: "Office Mac",
            deviceType: "desktop",
            lastSeen: new Date().toISOString(),
            status: "online",
          },
        ]}
        recentDevices={[
          {
            id: "online-1",
            name: "Office Mac",
            deviceType: "desktop",
            lastSeen: new Date().toISOString(),
            status: "online",
          },
          {
            id: "recent-1",
            name: "Old Web Session",
            deviceType: "web",
            lastSeen: new Date(Date.now() - 60_000).toISOString(),
            status: "offline",
          },
        ]}
        currentPage="welcome"
        onNavigate={onNavigate}
        onSelectDevice={onSelectDevice}
      />
    )

    expect(screen.getByText("当前在线")).toBeInTheDocument()
    expect(screen.getByText("最近设备")).toBeInTheDocument()
    expect(screen.getByText("Office Mac")).toBeInTheDocument()
    expect(screen.getByText("Old Web Session")).toBeInTheDocument()
    expect(screen.getByText("最近")).toBeInTheDocument()
  })

  it("selects a recent device when clicked", () => {
    render(
      <Sidebar
        localName="rust-send"
        connectionStatus="offline"
        devices={[]}
        recentDevices={[
          {
            id: "recent-2",
            name: "Travel Laptop",
            deviceType: "desktop",
            lastSeen: new Date(Date.now() - 5 * 60_000).toISOString(),
            status: "offline",
          },
        ]}
        currentPage="welcome"
        onNavigate={onNavigate}
        onSelectDevice={onSelectDevice}
      />
    )

    fireEvent.click(screen.getByText("Travel Laptop"))
    expect(onSelectDevice).toHaveBeenCalledWith("recent-2")
  })
})
