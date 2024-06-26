import { EM } from "../ecs/ecs.js";
import { Serializer } from "../utils/serialize.js";
import { NetworkEventType, } from "./network-events.js";
import { PeerDef, MeDef, InboxDef, OutboxDef, JoinDef, NetworkReadyDef, EventsToNetworkDef, send, HostCompDef, } from "./components.js";
import { MessageType, MAX_MESSAGE_SIZE } from "./message.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";
import { VERBOSE_NET_LOG } from "../flags.js";
const JOIN_RETRANSMIT = 100;
function registerConnectToServer() {
    EM.addSystem("connectToServer", Phase.NETWORK, null, [JoinDef, NetworkReadyDef, EventsToNetworkDef, TimeDef], (_, { join, eventsToNetwork, time }) => {
        switch (join.state) {
            case "start":
                eventsToNetwork.push({
                    type: NetworkEventType.Connect,
                    address: join.address,
                });
                join.state = "connecting";
                break;
            case "connecting":
                const peers = EM.filterEntities_uncached([PeerDef]);
                // TODO: this is a hacky way to tell if we're connected.
                if (peers.length > 0) {
                    EM.set(peers[0], HostCompDef);
                    // TODO: consider putting this message into the outbox rather than directly on the event queue
                    let message = new Serializer(8);
                    message.writeUint8(MessageType.Join);
                    eventsToNetwork.push({
                        type: NetworkEventType.MessageSend,
                        to: join.address,
                        buf: message.buffer,
                    });
                    join.state = "joining";
                    join.lastSendTime = time.time;
                }
                break;
            case "joining":
                if (join.lastSendTime + JOIN_RETRANSMIT < time.time) {
                    let message = new Serializer(8);
                    message.writeUint8(MessageType.Join);
                    eventsToNetwork.push({
                        type: NetworkEventType.MessageSend,
                        to: join.address,
                        buf: message.buffer,
                    });
                    join.state = "joining";
                    join.lastSendTime = time.time;
                }
        }
    });
}
function registerHandleJoin() {
    let handleJoin = (peers, { me }) => {
        for (let { peer, inbox, outbox } of peers) {
            while ((inbox.get(MessageType.Join) || []).length > 0) {
                console.log("Received join");
                let peer_addresses = peers
                    .filter((otherPeer) => otherPeer.peer.joined && otherPeer.peer.address !== peer.address)
                    .map((peer) => peer.peer.address);
                if (!peer.joined) {
                    peer.pid = peers.length + 1;
                    peer.joined = true;
                }
                let message = inbox.get(MessageType.Join).shift();
                let response = new Serializer(MAX_MESSAGE_SIZE);
                response.writeUint8(MessageType.JoinResponse);
                // PID of joining player
                response.writeUint8(peer.pid);
                response.writeUint8(peer_addresses.length);
                for (let peer of peer_addresses) {
                    response.writeString(peer);
                }
                send(outbox, response.buffer);
                peer.joined = true;
            }
        }
    };
    EM.addSystem("handleJoin", Phase.NETWORK, [PeerDef, InboxDef, OutboxDef], [MeDef], handleJoin);
}
function registerHandleJoinResponse() {
    let handleJoinResponse = (peers, { eventsToNetwork }) => {
        for (let { peer, inbox, outbox } of peers) {
            while ((inbox.get(MessageType.JoinResponse) || []).length > 0) {
                console.log("received join response");
                let message = inbox.get(MessageType.JoinResponse).shift();
                let join = EM.getResource(JoinDef);
                // TODO: add player object
                // TODO: this is a hack, need to actually have some system for reserving
                // object ids at each node
                if (join) {
                    let pid = message.readUint8();
                    EM.setDefaultRange("net");
                    EM.setIdRange("net", pid * 10000, (pid + 1) * 10000);
                    let npeers = message.readUint8();
                    for (let i = 0; i < npeers; i++) {
                        let address = message.readString();
                        eventsToNetwork.push({ type: NetworkEventType.Connect, address });
                    }
                    EM.addResource(MeDef, pid, false);
                    EM.removeResource(JoinDef);
                    if (VERBOSE_NET_LOG)
                        console.log(`me: ${pid}`);
                }
            }
        }
    };
    EM.addSystem("handleJoinResponse", Phase.NETWORK, [PeerDef, InboxDef, OutboxDef], [EventsToNetworkDef], handleJoinResponse);
}
export function initNetJoinSystems() {
    registerConnectToServer();
    registerHandleJoin();
    registerHandleJoinResponse();
}
//# sourceMappingURL=join.js.map