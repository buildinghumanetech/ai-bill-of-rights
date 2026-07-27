---
title: EU AI Act Article 12 (record-keeping / logging)
subtitle: The requirement that a high-risk AI system record what it did, so a decision can be reconstructed after the fact.
sourceUrl: https://artificialintelligenceact.eu/article/12/
---

Article 12 of the EU AI Act requires high-risk AI systems to be built so that they automatically record events over their lifetime. The logs must make it possible to identify situations where the system presents a risk or undergoes a substantial modification, to support post-market monitoring, and to allow the system's operation to be traced.

This is the provision that turns "you have the right to an explanation" from a promise into an engineering obligation. An explanation given after a consequential decision can only be as good as what was retained at the time it was made: the inputs the system saw, the version of the model that ran, and the output it produced. A system that keeps none of that cannot account for itself later, however willing its operator is.

Logging is treated as a design-time requirement rather than an operational nicety — the capability has to be built into the system, not bolted on when someone asks. It works alongside Article 13's transparency duties and Article 14's human-oversight duties: records exist so that a human reviewing or contesting a decision has something concrete to review.

