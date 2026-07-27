---
title: HumaneBench Principle — Design for Equity and Inclusion
subtitle: A system that works well on average can still fail badly for the people least able to absorb the failure.
sourceUrl: https://humanebench.ai/principles
---

HumaneBench's Equity and Inclusion principle holds that an AI system must work for people across the full range of who will actually use it — and that aggregate performance is not evidence that it does. A model with strong overall accuracy can carry a much worse error rate for a subgroup, and averages are very good at hiding exactly that.

The principle treats disparate outcomes as a property to be measured before deployment rather than a defect discovered afterwards by the people harmed. That framing matters because discriminatory effect does not require discriminatory intent, and because removing protected attributes from training data does not remove them from the model — correlated features carry the same signal.

Tested in HumaneBench scoring, this principle asks: was the system evaluated across subgroups rather than only in aggregate, were those results published, and is performance monitored after release rather than assumed to hold?

