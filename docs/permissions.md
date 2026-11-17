# Permission matrix

Cookie sessions use role checks. API keys additionally need a scope, act as their assigned user, and skip CSRF. A missing scope is 403. A revoked or unknown key is 401.

| Area | Admin | Distributor | Operator | Customer | API scope |
| --- | --- | --- | --- | --- | --- |
| Users in scope | yes | subtree | own customers | self | users:read / users:write |
| Custom attribute definitions | yes | view | view | no | — |
| ID prefixes | yes | no | no | no | — |
| Plans | write | read | read | no | — |
| Publish connection | in scope | in scope | own customers | no | connections:write |
| Free activation | yes | no | no | no | connections:write still rejected for non-admin |
| Payments | in scope | in scope | in scope | no | payments:write |
| Void payment | yes | no | no | no | — |
| Commission approve and payout | yes | own rows, read | own rows, read | no | commissions:read |
| Audit and API keys | yes | no | no | no | — |
| Reports and exports | all | subtree | own customers | no | — |

Developer, Super Admin, and Admin are the same role with different `adminType` labels. There is no extra permission split.
