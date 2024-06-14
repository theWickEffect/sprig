import { _entities } from "./ecs.js";
import { assert, hashCode } from "../utils/util.js";
// TODO(@darzu): RENAME: all "xxxxDef" -> "xxxxC" ?
export function componentNameToId(name) {
    return hashCode(name);
}
export const componentsToString = (cs) => `(${cs.map((c) => c.name).join(", ")})`;
export function isDeadC(e) {
    return "dead" === e.name;
}
export function isDeadE(e) {
    return "dead" in e;
} // TODO(@darzu): hacky, special components
export function isDeletedE(e) {
    return "deleted" in e;
}
const forbiddenComponentNames = new Set(["id"]);
export function createEMComponents() {
    const componentDefs = new Map(); // TODO(@darzu): rename to componentDefs ?
    const serializers = new Map();
    function defineComponent(name, construct, update = (p, ..._) => p, opts = { multiArg: false } // TODO(@darzu): any way around this cast?
    ) {
        const id = componentNameToId(name);
        assert(!componentDefs.has(id), `Component '${name}' already defined`);
        assert(!forbiddenComponentNames.has(name), `forbidden name: ${name}`);
        const component = {
            _brand: "componentDef", // TODO(@darzu): remove?
            updatable: true,
            name,
            construct,
            update,
            id,
            isOn: (e) => 
            // (e as Object).hasOwn(name),
            name in e,
            multiArg: opts.multiArg,
        };
        // TODO(@darzu): I don't love this cast. feels like it should be possible without..
        componentDefs.set(id, component);
        return component;
    }
    function defineNonupdatableComponent(name, construct, opts = { multiArg: false }) {
        const id = componentNameToId(name);
        if (componentDefs.has(id)) {
            throw `Component with name ${name} already defined--hash collision?`;
        }
        // TODO(@darzu): it'd be nice to a default constructor that takes p->p
        // const _construct = construct ?? ((...args: CArgs) => args[0]);
        const component = {
            _brand: "componentDef", // TODO(@darzu): remove?
            updatable: false,
            name,
            construct,
            update: (p) => p,
            // make,
            // update,
            id,
            isOn: (e) => 
            // (e as Object).hasOwn(name),
            name in e,
            multiArg: opts.multiArg,
        };
        componentDefs.set(id, component);
        return component;
    }
    function checkComponent(def) {
        if (!componentDefs.has(def.id))
            throw `Component ${def.name} (id ${def.id}) not found`;
        if (componentDefs.get(def.id).name !== def.name)
            throw `Component id ${def.id} has name ${componentDefs.get(def.id).name}, not ${def.name}`;
    }
    function registerSerializerPair(def, serialize, deserialize) {
        assert(def.updatable, `Can't attach serializers to non-updatable component '${def.name}'`);
        serializers.set(def.id, { serialize, deserialize });
    }
    function serialize(id, componentId, buf) {
        const def = componentDefs.get(componentId);
        if (!def)
            throw `Trying to serialize unknown component id ${componentId}`;
        const entity = _entities.findEntity(id, [def]);
        if (!entity)
            throw `Trying to serialize component ${def.name} on entity ${id}, which doesn't have it`;
        const serializerPair = serializers.get(componentId);
        if (!serializerPair)
            throw `No serializer for component ${def.name} (for entity ${id})`;
        // TODO(@darzu): DBG
        // if (componentId === 1867295084) {
        //   console.log(`serializing 1867295084`);
        // }
        serializerPair.serialize(entity[def.name], buf);
    }
    function deserialize(id, componentId, buf) {
        const def = componentDefs.get(componentId);
        if (!def)
            throw `Trying to deserialize unknown component id ${componentId}`;
        if (!_entities.hasEntity(id)) {
            throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
        }
        let entity = _entities.findEntity(id, [def]);
        const serializerPair = serializers.get(componentId);
        if (!serializerPair)
            throw `No deserializer for component ${def.name} (for entity ${id})`;
        const deserialize = (p) => {
            serializerPair.deserialize(p, buf);
            return p;
        };
        // TODO: because of this usage of dummy, deserializers don't
        // actually need to read buf.dummy
        if (buf.dummy) {
            deserialize({});
        }
        else if (!entity) {
            assert(def.updatable, `Trying to deserialize into non-updatable component '${def.name}'!`);
            _entities.addComponentInternal(id, def, deserialize, ...[]);
        }
        else {
            deserialize(entity[def.name]);
        }
        // TODO(@darzu): DBG
        // if (componentId === 1867295084) {
        //   console.log(`deserializing 1867295084, dummy: ${buf.dummy}`);
        // }
    }
    const res = {
        componentDefs,
        defineComponent,
        defineNonupdatableComponent,
        registerSerializerPair,
        serialize,
        deserialize,
        checkComponent,
    };
    return res;
}
//# sourceMappingURL=em-components.js.map