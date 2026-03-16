

# Plan: Enhanced Real-time Progress Indicator for Campaigns

## Current State

The `CampaignManager.tsx` component **already has** a progress bar, percentage display, and real-time updates (5s polling + realtime subscription). The basic functionality exists but can be improved for better visibility.

## Enhancements

### 1. Add animated pulse indicator for running campaigns
- Show a pulsing green dot next to "Executando" status
- Add estimated time remaining based on average send rate

### 2. Add a summary banner for active campaigns
- At the top of the CampaignManager, show a compact banner when any campaign is running
- Display: campaign name, animated progress bar, live counter "23/50 enviados", ETA
- Use `replied_count` to also show engagement rate in real-time

### 3. Improve the existing progress bar
- Add color segments: green for sent, red for failed, yellow for skipped
- Show skipped count alongside sent/failed
- Add a "pulsing" animation on the progress bar edge while running

## Files to Change

| File | Change |
|------|--------|
| `src/components/campaigns/CampaignManager.tsx` | Add active campaign banner, segmented progress bar, ETA calculation, pulse animation |

## No database or migration changes needed
The data is already available via the existing `whatsapp_campaigns` table and realtime subscription.

