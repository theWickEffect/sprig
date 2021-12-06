import { EM, EntityManager } from "./entity-manager.js";
import { SyncDef } from "./net/components.js";

export const DeletedDef = EM.defineComponent("deleted", () => true);

EM.registerSerializerPair(
  DeletedDef,
  () => {
    return;
  },
  () => {
    return;
  }
);

export function registerDeleteEntitiesSystem(em: EntityManager) {
  em.registerSystem([DeletedDef], [], (entities) => {
    for (let entity of entities) {
      // TODO: remove from renderer
      em.keepOnlyComponents(entity.id, [DeletedDef, SyncDef]);
      if (SyncDef.isOn(entity)) {
        const sync = em.findEntity(entity.id, [SyncDef])!.sync;
        sync.dynamicComponents = [];
        sync.fullComponents = [DeletedDef.id];
      }
    }
  });
}