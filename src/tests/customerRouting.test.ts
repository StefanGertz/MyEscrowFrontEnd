import { describe, expect, it } from "vitest";
import {
  customerRouteHref,
  parseCustomerRoute,
  resolveCustomerRoute,
} from "@/lib/customerRouting";

describe("customer portal routing", () => {
  it("restores the requested screen from a refreshed URL", () => {
    expect(parseCustomerRoute("?screen=wallet")).toEqual({
      screen: "wallet",
      transactionToken: undefined,
    });
  });

  it("restores a transaction detail route and preserves its token", () => {
    const href = customerRouteHref("transaction", "PO 1001/2");

    expect(href).toBe("/?screen=transaction&tx=PO+1001%2F2");
    expect(parseCustomerRoute(href.slice(1))).toEqual({
      screen: "transaction",
      transactionToken: "PO 1001/2",
    });
  });

  it("falls back safely when a URL contains an unknown screen", () => {
    expect(resolveCustomerRoute("not-a-screen", null)).toEqual({
      screen: "welcome",
      transactionToken: undefined,
    });
  });
});
