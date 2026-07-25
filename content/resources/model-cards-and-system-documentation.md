---
title: Model cards and system documentation
subtitle: The practice of shipping a written account of what a model was tested on, where it fails, and what it should not be used for.
sourceUrl: https://arxiv.org/abs/1810.03993
---

"Model Cards for Model Reporting" (Mitchell et al., 2019) proposed that every trained model ship with a short standardized document: its intended uses, its explicitly out-of-scope uses, the evaluation data, and — critically — performance disaggregated across groups and conditions rather than a single headline number. A companion line of work, "Datasheets for Datasets" (Gebru et al., 2021), does the same for training data: where it came from, who is in it, who is not, and what it should not be used to build.

The disaggregation requirement is the part that matters. An aggregate accuracy figure hides exactly the failure a model card is meant to expose: a system at 95% overall can be at 70% for a subgroup, and only per-group reporting makes that visible. This is where honest documentation and freedom from algorithmic discrimination meet.

The practice has since become a soft industry norm — model cards, system cards, and transparency reports now accompany most frontier model releases — but it remains voluntary, self-authored, and unaudited, with scope and rigor varying widely between publishers. The gap between "we published a system card" and "an external party verified these numbers" is the gap this Article is written to close.
