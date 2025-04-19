# Managers

## Refactoring notes

* GameStore injection currently is happening in the constructor. To better decouple Managers from the parent store, perhaps consider using the GameStoreService.