# Architecture Decision Records (ADR)

> Convention adoptée 2026-05-20 (à l'occasion de l'absorption REV).
> Format léger inspiré de [MADR](https://adr.github.io/madr/) — un fichier
> par décision structurelle, immuable une fois `Accepted`. Si la décision
> évolue, on écrit un **nouvel** ADR qui supersede l'ancien.

## Quand écrire un ADR

Une décision mérite un ADR si elle remplit au moins un de ces critères :

- Elle engage l'architecture pour plus de quelques semaines.
- Elle a des conséquences difficilement réversibles (schema DB, choix
  fournisseur, modèle d'auth, frontière de service).
- Il existe au moins une **alternative crédible** qui a été écartée et qu'on
  veut documenter pour la postérité.
- Un futur contributeur (humain ou IA) doit pouvoir comprendre **pourquoi**
  en relisant 6 mois plus tard.

Ce qui **n'a pas besoin** d'ADR : ajout d'un module métier, refactor local,
ajout d'une dépendance, fix de bug. La PR description suffit.

## Convention de nommage

`docs/booksystem/adr/YYYY-MM-DD-<slug-kebab-case>.md`

- Date = date d'**ouverture** de l'ADR (pas date de merge).
- Slug = sujet en quelques mots, exemples : `rev-absorption`,
  `rls-postgres-rollout`, `stripe-billing-provider`.

## Statuts

| Statut | Sens |
|---|---|
| `Proposed` | En discussion, n'engage pas encore. |
| `Accepted` | Validé par le PO, en cours d'implémentation ou implémenté. |
| `Superseded by <ADR>` | Remplacé par un ADR plus récent (toujours linker). |
| `Rejected` | Décision finalement non prise. On garde le fichier pour mémoire. |

Un ADR `Accepted` ne se modifie plus sur le fond. Seules les corrections
typo / liens / dates de référence sont permises.

## Template

```markdown
# ADR YYYY-MM-DD — Titre court

- **Statut :** Proposed | Accepted | Superseded by ADR … | Rejected
- **Date :** YYYY-MM-DD
- **Décideurs :** … (PO, lead engineering)
- **Contexte technique :** liens vers booksystem ch. concernés

## Contexte

Quel est le problème ? Quelles contraintes ? Pourquoi décider maintenant ?

## Décision

La décision prise, en une phrase d'abord, puis détail.

## Conséquences

### Positives

…

### Négatives / risques

…

## Alternatives considérées

Au moins une, idéalement deux, avec les raisons du rejet.

## Plan d'implémentation

Sprints / phases / PRs prévues.

## Open questions

Ce qui reste à trancher avant ou pendant l'implémentation.

## Liens

- Booksystem chapitres impactés
- ADRs liés
- PRs / issues
```

## Index

| Date | ADR | Statut |
|---|---|---|
| 2026-05-20 | [Absorption Projet-REV → mybeez](./2026-05-20-rev-absorption.md) | Proposed |
