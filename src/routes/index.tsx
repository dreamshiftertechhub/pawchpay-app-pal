import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PawchPay — Send money, pay bills, grow" },
      {
        name: "description",
        content:
          "PawchPay is your everyday money app: instant transfers, airtime and bills, virtual cards, and PawchLoan — all in one wallet.",
      },
      { property: "og:title", content: "PawchPay — Send money, pay bills, grow" },
      {
        property: "og:description",
        content:
          "Instant transfers, airtime and bills, virtual cards, and PawchLoan — all in one wallet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/pawchpay.html"
      title="PawchPay"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
      }}
    />
  );
}
