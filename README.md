# Builder

**Builder is a global marketplace for sharing people (labour) between construction/contracting companies.** Built as an Appfarm Create app — this repo is the source of truth for its coded components (brand: Builder.as).

> For the engineering workflow (how coded components are structured, versioned, and synced into Appfarm Create), see [CLAUDE.md](CLAUDE.md).

## Core value proposition

Balance workforce supply and demand *between* companies instead of inside one.

- Have **more** people than current work needs → **lease them out** instead of firing or laying off (permittering).
- Have **too few** → **lease them in** from a company with surplus instead of hiring.

This avoids the cost and pain of the hire/fire cycle: idle crews earn instead of sitting, and short-staffed projects get covered without permanent headcount.

## Marketplace model

An **open marketplace** — any participating company can post and match surplus and needs — that **also facilitates closed networks** for groups of businesses that already cooperate. Reach is **global**, though the product's roots and domain vocabulary are Norwegian.

## Business model

The **transaction fee on each lease** arranged through the platform is the **main revenue driver**, with **subscription (SaaS)** as secondary. Strategic implication: **the goal is to facilitate as much marketplace activity (leases in/out) as possible** — every feature, including the resource planner surfacing uncovered need and surplus, exists to drive more matches and completed leases.

## Users

Project planners, HR, and resource planners — broadly, anyone who manages and allocates people.

## App modules

- **Resource planner** — the supporting value prop and the engine that makes the marketplace useful: gives each company an overview of its own use and capacity and highlights supply vs. demand. Built from the `resource-*` coded components:
  - **resource-planning-grid** — editable multi-project grid; summary row per source type plus expandable per-work-type detail rows for inline editing.
  - **resource-demand-chart** — stacked-bar + line chart of weekly demand vs. supply.
  - **resource-allocation-calendar** — date-positioned (span-native) timeline for creating, moving, and resizing allocations and absences per person.
- **Marketplace / matching** — browse, post, and match surplus and needs across companies.
- **Contracts / agreements** — handling the lease agreement and terms between the two companies.
- **Worker profiles** — people with skills, work types, availability.
- **Cost** — manual, project-level recording of hours used and money owed. Builder does **not** do detailed hour tracking or billing — only manual project-level cost input.

## How the planner drives more leases

The resource planner is the top of the marketplace funnel: planning generates the supply and demand that becomes lease transactions.

- **It manufactures intent.** As a company plans its work, the planner derives **udekt** (uncovered need) and **overskudd** (surplus) per week and work type. Udekt is a lease-*in* lead; overskudd is a lease-*out* lead. Planning that used to live in spreadsheets now produces structured, matchable demand and supply inside Builder.
- **It makes the gap visible and uncomfortable.** Surfacing udekt/overskudd loud and early turns a vague staffing worry into a concrete "you have 3 uncovered carpenter-weeks" prompt — the moment a user is most motivated to post or accept a lease.
- **It lowers friction to act.** From the planner the udekt/overskudd readout should lead directly into marketplace/matching, so the user converts a planned gap into a lease without leaving their workflow.
- **It keeps companies planning in Builder.** The more a company runs its weekly planning here, the more continuous supply/demand signal Builder has to match — and the more leases (transaction fees) result. Stickiness in the planner = liquidity in the marketplace.

Design consequence: anything that increases planning adoption, makes udekt/overskudd more trustworthy/visible, or shortens the path from "gap spotted" to "lease posted/accepted" is directly revenue-aligned.

## Domain vocabulary — source types (Norwegian)

These drive the planner and map directly onto the lease-in/lease-out marketplace logic:

| Term | Meaning | Role |
|------|---------|------|
| **behov** | demand / need (the requirement line) | editable |
| **egne** | own employees | — |
| **innleide** | hired-in (leased *in* from another company) | editable |
| **utleide** | hired-out (leased *out* to another company) | editable |
| **udekt** | uncovered need — signals "lease in" | derived / read-only |
| **overskudd** | surplus — signals "lease out" | derived / read-only |

The grid recomputes udekt/overskudd optimistically client-side without a server round-trip.
