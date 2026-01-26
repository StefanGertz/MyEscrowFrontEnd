export type SummaryMetric = {
  id: string;
  label: string;
  value: string;
  meta: string;
};

export type EscrowStatus = "success" | "warning";

export type EscrowRecord = {
  id: string;
  counterpart: string;
  amount: string;
  stage: string;
  due: string;
  status: EscrowStatus;
  counterpartyApproved: boolean;
};

export type TimelineEvent = {
  id: string;
  title: string;
  meta: string;
  time: string;
  status: "released" | "attention" | "funding";
};

export type DisputeTicket = {
  id: string;
  title: string;
  owner: string;
  amount: string;
  updated: string;
  priority: "high" | "medium";
};

export const summaryMetrics: SummaryMetric[] = [
  {
    id: "held",
    label: "Held in Escrow",
    value: "$482,900",
    meta: "+18% vs last 30 days",
  },
  {
    id: "release",
    label: "Releases scheduled",
    value: "$92,400",
    meta: "5 payouts this week",
  },
  {
    id: "disputes",
    label: "Disputes open",
    value: "2 cases",
    meta: "Avg resolution 3.1 days",
  },
  {
    id: "verified",
    label: "Verified payers",
    value: "46 teams",
    meta: "+4 onboarded this week",
  },
];

export const activeEscrows: EscrowRecord[] = [
  {
    id: "PO-1423",
    counterpart: "Northwind Agency",
    amount: "$82,000",
    stage: "Mobile app v1",
    due: "Due in 3 days",
    status: "success",
    counterpartyApproved: false,
  },
  {
    id: "PO-0988",
    counterpart: "Cloud Harbor",
    amount: "$120,500",
    stage: "Milestone 3 / 5",
    due: "Releasing today",
    status: "warning",
    counterpartyApproved: true,
  },
  {
    id: "PO-0772",
    counterpart: "Summit Legal",
    amount: "$44,300",
    stage: "KYC & compliance scope",
    due: "Review in 1 day",
    status: "success",
    counterpartyApproved: true,
  },
];

export const reviewEscrows: EscrowRecord[] = [
  ...activeEscrows,
  {
    id: "PO-0650",
    counterpart: "Bright Freight",
    amount: "$64,800",
    stage: "Delivery confirmation",
    due: "Upload POD",
    status: "warning",
    counterpartyApproved: false,
  },
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: "tl-1",
    title: "Mobile release verified",
    meta: "Milestone release to Northwind",
    time: "2 hours ago",
    status: "released",
  },
  {
    id: "tl-2",
    title: "Ops requested scope check",
    meta: "Cloud Harbor flagged potential overages",
    time: "Today, 9:24 AM",
    status: "attention",
  },
  {
    id: "tl-3",
    title: "Funds received",
    meta: "Summit Legal replenished trust",
    time: "Yesterday",
    status: "funding",
  },
];

export const disputeTickets: DisputeTicket[] = [
  {
    id: "DSP-08",
    title: "Northwind: QA scope clarification",
    owner: "Ops Team 2",
    amount: "$42,000 held",
    updated: "Last update 45m ago",
    priority: "high",
  },
  {
    id: "DSP-07",
    title: "Studio Delta: late delivery claim",
    owner: "Ops Team 4",
    amount: "$18,200 held",
    updated: "Last update 3h ago",
    priority: "medium",
  },
];
