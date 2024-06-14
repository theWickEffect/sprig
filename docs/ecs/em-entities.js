import { DBG_ASSERT, DBG_VERBOSE_ENTITY_PROMISE_CALLSITES, DBG_INIT_CAUSATION, } from "../flags.js";
import { getCallStack } from "../utils/util-no-import.js";
import { assert } from "../utils/util.js";
import { _meta } from "./ecs.js";
import { componentNameToId } from "./em-components.js";
import { isDeadC } from "./em-components.js";
import { isDeletedE } from "./em-components.js";
import { isDeadE } from "./em-components.js";
import { componentsToString } from "./em-components.js";
import { _components } from "./ecs.js";
import { _init } from "./ecs.js";
import { _systems } from "./ecs.js";
export function createEMEntities() {
    const entities = new Map();
    const entityPromises = new Map();
    const seenComponents = new Set();
    // TODO(@darzu): MULTIPLAYER. Remove ID ranges, use net ids
    const ranges = {};
    let defaultRange = "";
    // TODO(@darzu): use version numbers instead of dirty flag?
    const _changedEntities = new Set();
    let _nextEntityPromiseId = 0;
    const _dbgEntityPromiseCallsites = new Map();
    function setDefaultRange(rangeName) {
        defaultRange = rangeName;
    }
    function setIdRange(rangeName, nextId, maxId) {
        ranges[rangeName] = { nextId, maxId };
    }
    // TODO(@darzu): dont return the entity!
    function mk(rangeName) {
        if (rangeName === undefined)
            rangeName = defaultRange;
        const range = ranges[rangeName];
        if (!range) {
            throw `Entity manager has no ID range (range specifier is ${rangeName})`;
        }
        if (range.nextId >= range.maxId)
            throw `EntityManager has exceeded its id range!`;
        // TODO(@darzu): does it matter using Object.create(null) here? It's kinda cleaner
        //  to not have a prototype (toString etc).
        // const e = { id: range.nextId++ };
        const e = Object.create(null);
        e.id = range.nextId++;
        if (e.id > 2 ** 15)
            console.warn(`We're halfway through our local entity ID space! Physics assumes IDs are < 2^16`);
        entities.set(e.id, e);
        _systems._notifyNewEntity(e);
        // if (e.id === 10052) throw new Error("Created here!");
        return e;
    }
    function registerEntity(id) {
        assert(!entities.has(id), `EntityManager already has id ${id}!`);
        /* TODO: should we do the check below but for all ranges?
        if (nextId <= id && id < maxId)
        throw `EntityManager cannot register foreign ids inside its local range; ${nextId} <= ${id} && ${id} < ${maxId}!`;
        */
        // const e = { id: id };
        const e = Object.create(null); // no prototype
        e.id = id;
        entities.set(e.id, e);
        _systems._notifyNewEntity(e);
        return e;
    }
    function addComponent(id, def, ...args) {
        return addComponentInternal(id, def, undefined, ...args);
    }
    function addComponentInternal(id, def, customUpdate, ...args) {
        _components.checkComponent(def);
        if (id === 0)
            throw `hey, use addResource!`;
        const e = entities.get(id);
        // TODO: this is hacky--EM shouldn't know about "deleted"
        if (DBG_ASSERT && isDeletedE(e)) {
            console.error(`Trying to add component ${def.name} to deleted entity ${id}`);
        }
        if (def.name in e)
            throw `double defining component ${def.name} on ${e.id}!`;
        let c;
        if (def.updatable) {
            c = def.construct();
            c = customUpdate ? customUpdate(c, ...args) : def.update(c, ...args);
        }
        else {
            c = def.construct(...args);
        }
        e[def.name] = c;
        result.seenComponents.add(def.id);
        _systems._notifyAddComponent(e, def);
        // track changes for entity promises
        // TODO(@darzu): PERF. maybe move all the system query update stuff to use this too?
        _changedEntities.add(e.id);
        return c;
    }
    function addComponentByName(id, name, ...args) {
        console.log("addComponentByName called, should only be called for debugging");
        let component = _components.componentDefs.get(componentNameToId(name));
        if (!component) {
            throw `no component named ${name}`;
        }
        return addComponent(id, component, ...args);
    }
    function ensureComponent(id, def, ...args) {
        _components.checkComponent(def);
        const e = entities.get(id);
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            return addComponent(id, def, ...args);
        }
        else {
            return e[def.name];
        }
    }
    function set(e, def, ...args) {
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            addComponent(e.id, def, ...args);
        }
        else {
            assert(def.updatable, `Trying to double set non-updatable component '${def.name}' on '${e.id}'`);
            // if (def.name === "authority") throw new Error(`double-set authority`);
            // dbgLogOnce(`update: ${e.id}.${def.name}`);
            e[def.name] = def.update(e[def.name], ...args);
        }
    }
    function setOnce(e, def, ...args) {
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            addComponent(e.id, def, ...args);
        }
    }
    function hasEntity(id) {
        return entities.has(id);
    }
    // TODO(@darzu): rethink how component add/remove happens. This is maybe always flags
    function removeComponent(id, def) {
        if (!tryRemoveComponent(id, def))
            throw `Tried to remove absent component ${def.name} from entity ${id}`;
    }
    function tryRemoveComponent(id, def) {
        const e = entities.get(id);
        if (def.name in e) {
            delete e[def.name];
        }
        else {
            return false;
        }
        _systems._notifyRemoveComponent(e, def);
        return true;
    }
    function keepOnlyComponents(id, cs) {
        let ent = entities.get(id);
        if (!ent)
            throw `Tried to delete non-existent entity ${id}`;
        for (let component of _components.componentDefs.values()) {
            if (!cs.includes(component) && ent[component.name]) {
                removeComponent(id, component);
            }
        }
    }
    function hasComponents(e, cs) {
        return cs.every((c) => c.name in e);
    }
    function findEntity(id, cs) {
        const e = entities.get(id);
        if (!e || !cs.every((c) => c.name in e)) {
            return undefined;
        }
        return e;
    }
    // TODO(@darzu): PERF. cache these responses like we do systems?
    // TODO(@darzu): PERF. evaluate all per-frame uses of this
    function filterEntities_uncached(cs) {
        const res = [];
        if (cs === null)
            return res;
        const inclDead = cs.some((c) => isDeadC(c)); // TODO(@darzu): HACK? for DeadDef
        for (let e of entities.values()) {
            if (!inclDead && isDeadE(e))
                continue;
            if (e.id === 0)
                continue; // TODO(@darzu): Remove ent 0, make first-class Resources
            if (cs.every((c) => c.name in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    function dbgFilterEntitiesByKey(cs) {
        // TODO(@darzu): respect "DeadDef" comp ?
        console.log("filterEntitiesByKey called--should only be called from console");
        const res = [];
        if (typeof cs === "string")
            cs = [cs];
        for (let e of entities.values()) {
            if (cs.every((c) => c in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    // private _callSystem(name: string) {
    //   if (!maybeRequireSystem(name)) throw `No system named ${name}`;
    // }
    // _dbgFirstXFrames = 10;
    // dbgStrEntityPromises() {
    //   let res = "";
    //   res += `changed ents: ${[..._changedEntities.values()].join(",")}\n`;
    //   entityPromises.forEach((promises, id) => {
    //     for (let s of promises) {
    //       const unmet = s.cs.filter((c) => !c.isOn(s.e)).map((c) => c.name);
    //       res += `#${id} is waiting for ${unmet.join(",")}\n`;
    //     }
    //   });
    //   return res;
    // }
    function dbgEntityPromises() {
        let res = "";
        for (let [id, prom] of entityPromises.entries()) {
            const ent = entities.get(id) || { id };
            const unmet = prom
                .flatMap((p) => p.cs.map((c) => c.name))
                .filter((n) => !(n in ent));
            res += `ent waiting: ${id} <- (${unmet.join(",")})\n`;
        }
        return res;
    }
    // TODO(@darzu): can this consolidate with the InitFn system?
    // TODO(@darzu): PERF TRACKING. Need to rethink how this interacts with system and init fn perf tracking
    // TODO(@darzu): EXPERIMENT: returns madeProgress
    function progressEntityPromises() {
        let madeProgress = false;
        // console.dir(entityPromises);
        // console.log(dbgStrEntityPromises());
        // _dbgFirstXFrames--;
        // if (_dbgFirstXFrames <= 0) throw "STOP";
        const beforeOneShots = performance.now();
        // check entity promises
        let finishedEntities = new Set();
        entityPromises.forEach((promises, id) => {
            // no change
            if (!_changedEntities.has(id)) {
                // console.log(`no change on: ${id}`);
                return;
            }
            // check each promise (reverse so we can remove)
            for (let idx = promises.length - 1; idx >= 0; idx--) {
                const s = promises[idx];
                // promise full filled?
                if (!s.cs.every((c) => c.name in s.e)) {
                    // console.log(`still doesn't match: ${id}`);
                    continue;
                }
                // call callback
                const afterOneShotQuery = performance.now();
                const stats = _systems.sysStats["__oneShots"];
                stats.queries += 1;
                _meta.emStats.queryTime += afterOneShotQuery - beforeOneShots;
                promises.splice(idx, 1);
                // TODO(@darzu): how to handle async callbacks and their timing?
                // TODO(@darzu): one idea: only call the callback in the same phase or system
                //    timing location that originally asked for the promise
                s.callback(s.e);
                madeProgress = true;
                const afterOneShotCall = performance.now();
                stats.calls += 1;
                const thisCallTime = afterOneShotCall - afterOneShotQuery;
                stats.callTime += thisCallTime;
                stats.maxCallTime = Math.max(stats.maxCallTime, thisCallTime);
            }
            // clean up
            if (promises.length === 0)
                finishedEntities.add(id);
        });
        // clean up
        for (let id of finishedEntities) {
            entityPromises.delete(id);
        }
        _changedEntities.clear();
        return madeProgress;
    }
    // TODO(@darzu): Rethink naming here
    // NOTE: if you're gonna change the types, change registerSystem first and just copy
    //  them down to here
    // TODO(@darzu): Used for waiting on:
    //    uniform e.g. RenderDataStdDef, Finished, WorldFrame, RenderableDef (enable/hidden/meshHandle)),
    //    Renderable for updateMeshQuadInds etc, PhysicsStateDef for physCollider aabb,
    function whenEntityHas(e, ...cs) {
        // short circuit if we already have the components
        if (cs.every((c) => c.name in e))
            return Promise.resolve(e);
        // TODO(@darzu): this is too copy-pasted from registerSystem
        // TODO(@darzu): need unified query maybe?
        // let _name = "oneShot" + ++;
        // if (entityPromises.has(_name))
        //   throw `One-shot single system named ${_name} already defined.`;
        // use one bucket for all one shots. Change this if we want more granularity
        _systems.sysStats["__oneShots"] = _systems.sysStats["__oneShots"] ?? {
            calls: 0,
            queries: 0,
            callTime: 0,
            maxCallTime: 0,
            queryTime: 0,
        };
        const promiseId = _nextEntityPromiseId++;
        if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES || DBG_INIT_CAUSATION) {
            // if (dbgOnce("getCallStack")) console.dir(getCallStack());
            let line = getCallStack().find((s) => !s.includes("entity-manager") && //
                !s.includes("em-helpers"));
            if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES)
                console.log(`promise #${promiseId}: ${componentsToString(cs)} from: ${line}`);
            _dbgEntityPromiseCallsites.set(promiseId, line);
        }
        return new Promise((resolve, reject) => {
            const sys = {
                id: promiseId,
                e,
                cs,
                callback: resolve,
                // name: _name,
            };
            if (entityPromises.has(e.id))
                entityPromises.get(e.id).push(sys);
            else
                entityPromises.set(e.id, [sys]);
        });
    }
    // TODO(@darzu): feels a bit hacky; lets track usages and see if we can make this
    //  feel natural.
    // TODO(@darzu): is perf okay here?
    function whenSingleEntity(...cs) {
        return new Promise((resolve) => {
            const ents = filterEntities_uncached(cs);
            if (ents.length === 1)
                resolve(ents[0]);
            _init.addEagerInit(cs, [], [], () => {
                const ents = filterEntities_uncached(cs);
                if (!ents || ents.length !== 1)
                    assert(false, `Invalid 'whenSingleEntity' call; found ${ents.length} matching entities for '${cs.map((c) => c.name).join(",")}'`);
                resolve(ents[0]);
            });
        });
    }
    const result = {
        // entities
        entities,
        seenComponents,
        setDefaultRange,
        setIdRange,
        mk,
        registerEntity,
        addComponent,
        addComponentByName,
        addComponentInternal,
        ensureComponent,
        set,
        setOnce,
        hasEntity,
        removeComponent,
        tryRemoveComponent,
        keepOnlyComponents,
        hasComponents,
        findEntity,
        filterEntities_uncached,
        dbgFilterEntitiesByKey,
        whenEntityHas,
        whenSingleEntity,
        progressEntityPromises,
    };
    return result;
}
//# sourceMappingURL=em-entities.js.map