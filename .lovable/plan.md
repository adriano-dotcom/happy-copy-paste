

# Fix Outbound Seller Stats Panel

## Problems Found
1. **"Sem nome" everywhere**: `assigned_user_name` is NULL in all prospecting conversations. The code uses this field directly instead of looking up names from `team_members`.
2. **No prospecting filter**: Query fetches ALL conversations with `assigned_user_id`, not just `metadata->origin = 'prospeccao'`.
3. **Response rate >100%**: Counting responses per-conversation but templates per-message, creating mismatched denominators.

## Real Data
- Alessandro Francisco (91ec229f): 18 prospecting conversations
- Leonardo Sanches (ffe0eaca): 3 prospecting conversations  
- Joao (2b8ff9f9): 1 prospecting conversation
- Adriana Jacometo (9db32c89): 1 prospecting conversation

## Changes

### `src/components/ProspectingDashboard.tsx`
1. **Add prospecting filter**: Add `.eq('metadata->>origin', 'prospeccao')` to the conversations query
2. **Look up seller names from `team_members`**: After fetching conversations, fetch team members and build a name map by ID
3. **Fix response rate**: Count responses as number of conversations with user reply (not individual messages), and use conversations count as denominator instead of template message count
4. **Use conversations as base metric**: "Enviados" = number of prospecting conversations per seller, "Respostas" = conversations with at least one user reply, "Taxa" = respostas/enviados

### Metric Definitions (corrected)
| Metric | Definition |
|--------|-----------|
| Enviados | Prospecting conversations assigned to seller |
| Respostas | Conversations where client replied (has `from_type='user'` message) |
| Taxa | Respostas / Enviados × 100 |
| Pipedrive | Contacts from these conversations that have a deal with `pipedrive_deal_id` |

