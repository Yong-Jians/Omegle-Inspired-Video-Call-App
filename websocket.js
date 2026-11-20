import { WebSocketServer } from "ws";
import express from "express"
import "dotenv/config"



export let User_List = new Map()
export let single_calls = new Map()
export let group_calls = new Map()

export const websocketRouter = express.Router()


websocketRouter.get("/getCredits", (req, res) => {
    return res.status(200).json({ username: process.env.TURN_USERNAME, password: process.env.TURN_PASSWORD })
})

export default function SocketSetup(server) {

    const socketserver = new WebSocketServer({ server })


    socketserver.on('connection', (ws) => {
        console.log("connection on!")

        ws.on("close", () => {
            if (User_List.has(ws)) {
                User_List.delete(ws)
                console.log("removed user")

                if (single_calls.has(ws)) {
                    single_calls.delete(ws)
                }
                group_calls.forEach((room) => {
                    const existingRoom = group_calls.get(room)

                    if (existingRoom) {
                        const userThatLeft = existingRoom.room.find(user => user["socket"] == ws)

                        if (!userThatLeft) { return }

                        const updatedroom = existingRoom.room.filter(user => user["socket"] !== ws)
                        existingRoom.room = updatedroom

                        if (existingRoom.room.length == 0) {
                            group_calls.delete(existingRoom)
                        }
                    }
                })

            }
        })

        ws.on("message", (data) => {
            const Data = JSON.parse(data)


            if (Data.type == "addUser") {

                if (!User_List.has(ws)) {
                    User_List.set(ws, { id: Data.id, socket: ws, busy: false, callType: "" })
                }

            }

            if (Data.type == "joinCall") {
                if (User_List.has(ws)) {
                    User_List.get(ws).callType = Data.call_type

                    if (Data.call_type == "single") {
                        if (!single_calls.has(ws)) {
                            single_calls.set(ws,
                                { id: User_List.get(ws).id, socket: ws, busy: false }
                            )
                            const getUsers = [...single_calls.values()].filter(user => user["busy"] !== true)

                            getUsers.forEach((user) => {
                                user["socket"].send(JSON.stringify({ type: "getPeers", otherPeers: getUsers, id: user["id"] }))
                            })
                        }
                    } else {
                        if (group_calls.size > 0) {

                            const avaliableGroupcalls = [...group_calls.values()].filter(room => room["room"].length < 5)

                            if (avaliableGroupcalls.length > 0 ) {

                                avaliableGroupcalls[0].room.push({ id: User_List.get(ws).id, socket: ws, busy: false })

                                 const getUsers = avaliableGroupcalls[0].room


                                    getUsers.forEach((user) => {
                                        user["socket"].send(JSON.stringify({ type: "getPeers", otherPeers: getUsers, id: user["id"] }))
                                    })


                            }else {
                                  const room_name = `room${group_calls.size}`
                            group_calls.set(room_name, { room: [] })


                            group_calls.get(room_name).room.push({ id: User_List.get(ws).id, socket: ws, busy: false })


                            const getUsers = group_calls.get(room_name).room

                            getUsers.forEach((user) => {
                                user["socket"].send(JSON.stringify({ type: "getPeers", otherPeers: getUsers, id: user["id"] }))
                            })


                            }


                        } else {
                            const room_name = `room${group_calls.size}`
                            group_calls.set(room_name, { room: [] })


                            group_calls.get(room_name).room.push({ id: User_List.get(ws).id, socket: ws, busy: false })


                            const getUsers = group_calls.get(room_name).room

                            getUsers.forEach((user) => {
                                user["socket"].send(JSON.stringify({ type: "getPeers", otherPeers: getUsers, id: user["id"] }))
                            })
                        }

                    }


                }

            }

            if (Data.type == "sendCandidate") {
                const targetUser = [...User_List.values()].find(user => user["id"] == Data.target)


            if (targetUser) {
                
                targetUser["socket"].send(JSON.stringify({ type: "receiveCandidate", candidate: Data.candidate, sender: Data.sender }))
            }
            }

            if (Data.type == "sendOffer") {
                const targetUser = [...User_List.values()].find(user => user["id"] == Data.target)

                if (targetUser) {
                    if (single_calls.has(targetUser["socket"])) {
                        single_calls.get(targetUser["socket"]).busy = true
                    }

                    console.log(single_calls.get(targetUser["socket"]))
                    targetUser["socket"].send(JSON.stringify({ type: "receiveOffer", offer: Data.offer, sender: Data.sender }))
                }
            }

            if (Data.type == "sendAnswer") {
                const targetUser = [...User_List.values()].find(user => user["id"] == Data.target)

                if (targetUser) {

                    if (single_calls.has(targetUser["socket"])) {
                        single_calls.get(targetUser["socket"]).busy = true
                    }


                    targetUser["socket"].send(JSON.stringify({ type: "receiveAnswer", answer: Data.answer, sender: Data.sender }))
                }
            }

            if (Data.type == "onPeerLeave") {
                const finduser = [...User_List.values()].find(user => user["id"] == Data.target)

                if (finduser) {

                    if (single_calls.has(targetUser["socket"])) {
                        single_calls.get(targetUser["socket"]).busy = false
                        single_calls.delete(ws)
                    }

                    group_calls.forEach((room) => {

                        const index = room.room.findIndex(user => user.socket === ws);

                        if (index !== -1) {
                            room.room.splice(index, 1);
                        }
                    })

                    finduser["socket"].send(JSON.stringify({ type: "onPeerLeave", id: Data.id, streamId: Data.streamId }))
                }


            }

            if (Data.type == "onPeerMute") {
                const finduser = [...User_List.values()].find(user => user["id"] == Data.target)

                if (finduser) {

                    finduser["socket"].send(JSON.stringify({ type: "onPeerMute", target: Data.mutedId, mute: Data.mute }))
                }
            }




        })
    })

}


