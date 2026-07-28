---
title: US civil rights and anti-discrimination law
subtitle: Title VII, ECOA, the Fair Housing Act, and the ADA already apply to algorithmic decisions — the algorithm is not a defense.
sourceUrl: https://www.eeoc.gov/laws/guidance/select-issues-assessing-adverse-impact-software-algorithms-and-artificial
---

Automated decision-making does not create a gap in US anti-discrimination law. Title VII of the Civil Rights Act of 1964 (employment), the Equal Credit Opportunity Act (lending), the Fair Housing Act (housing), the Americans with Disabilities Act, and the Age Discrimination in Employment Act all reach decisions made by software exactly as they reach decisions made by people. An employer that uses a vendor's screening model is still the employer.

The central doctrine here is disparate impact: a facially neutral practice that falls more harshly on a protected group is unlawful unless it is job-related and consistent with business necessity — and even then, unlawful if a less discriminatory alternative exists. Intent is not an element. This is why "we never fed the model race" is not a defense: proxies (ZIP code, name, school, résumé gaps, device type, dialect) reconstruct protected characteristics from correlated data, and the law measures the outcome.

The EEOC's guidance on algorithms and the ADA, its Title VII guidance on adverse impact in selection software, and the CFPB's position that ECOA's adverse-action notice requirement applies to complex models all say the same thing: if you deploy the system, you own its disparate impact, and you are expected to have tested for it — the four-fifths rule being a rule of thumb, not a safe harbor.
