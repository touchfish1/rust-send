import { describe, expect, it } from "vitest"
import {
  buildPairingUrl,
  extractRelayUrlFromLocation,
  isLoopbackHost,
  isRelayUrl,
} from "@/lib/pairing"

describe("pairing helpers", () => {
  it("builds a pairing url with relay config", () => {
    expect(buildPairingUrl("http://192.168.1.9:1420/chat/123", "wss://relay.example.com/ws")).toBe(
      "http://192.168.1.9:1420/?relay=wss%3A%2F%2Frelay.example.com%2Fws"
    )
  })

  it("extracts a valid relay url from location", () => {
    expect(
      extractRelayUrlFromLocation("https://rust-send.dev/?relay=ws%3A%2F%2Flocalhost%3A8080%2Fws")
    ).toBe("ws://localhost:8080/ws")
  })

  it("rejects invalid relay urls", () => {
    expect(isRelayUrl("https://rust-send.dev")).toBe(false)
    expect(extractRelayUrlFromLocation("https://rust-send.dev/?relay=https://bad.example.com")).toBe(null)
  })

  it("detects loopback hosts", () => {
    expect(isLoopbackHost("localhost")).toBe(true)
    expect(isLoopbackHost("192.168.1.9")).toBe(false)
  })
})
