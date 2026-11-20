import { useEffect, useRef, useState } from 'react'
import './App.css'
import { useNavigate } from 'react-router'


export default function VideoCall() {
    const navigate = useNavigate()
    const websocketREF = useRef(null)
    const [userId, setUserId] = useState("")
    const [peerList, setPeerList] = useState([])
    const [remoteStreams, setRemoteStreams] = useState([])
    const [incall, setInCall] = useState(false)

    const localVideoREF = useRef(null)
    const localStreamREF = useRef(null)
    const localStreamId = useRef(0)
    const peerListREF = useRef([])
    const BufferingOffersREF = useRef(new Map())
    const bufferingICECandidatesREF = useRef(new Map())
    const idREF = useRef("")
    const [mute, setMuteStatus] = useState(false)
    const [muteAll, setMuteAll] = useState(false)

    const messgeQueueREF = useState(Promise.resolve())



    async function acceptBufferingCandidates() {
        for (const pc of peerListREF.current) {
            const peer = pc.peerObject;
            const candidates = bufferingICECandidatesREF.current.get(pc.id);

            if (!peer?.remoteDescription || !candidates) continue;

            for (const candidate of candidates) {
                try {
                    await peer.addIceCandidate(candidate);
                } catch (error) {
                    console.error("Failed to add ICE candidate:", error);
                }
            }

            bufferingICECandidatesREF.current.delete(pc.id);
        }
    }



    function Mute() {
        const nextMuted = !mute;
        setMuteStatus(nextMuted);

        peerList.map((peer) => {
            websocketREF.current.send(JSON.stringify({ type: "onPeerMute", target: peer["id"], mutedId: userId, mute: !mute }))
        })


        // localVideoREF.current?.srcObject
        //     ?.getAudioTracks()
        //     .forEach(track => {
        //         track.enabled = !nextMuted;
        //     });

        // console.log(nextMuted ? "muted!!" : "unmuted!!");
    }

    function MuteAll() {
        const ismute = muteAll === false ? true : false
        setMuteAll(ismute)
        console.log(ismute)
        Mute()
    }

    function Leave() {

        localVideoREF.current.srcObject = null
        localStreamREF.current = null
        remoteStreams.map((user) => {
            websocketREF.current.send(JSON.stringify({ type: "onPeerLeave", id: idREF.current, streamId: localStreamId.current, target: user["user_id"] }))
        })


        setRemoteStreams([])

        navigate("/")
    }

    function joinSingle() {

        websocketREF.current.send(JSON.stringify({ type: "joinCall", call_type: "single" }))
    }

    function joinGroup() {
        websocketREF.current.send(JSON.stringify({ type: "joinCall", call_type: "group" }))
    }

    function GenerateRandomId() {
        let id = "";
        for (let i = 0; i < 5; i++) {
            const randomnum = Math.floor(Math.random() * 9).toString()
            id += randomnum
        }

        return id
    }

    async function handleOffer(peer, offer, target) {

        await peer["peerObject"].setRemoteDescription(offer)
        const answer = await peer["peerObject"].createAnswer()
        await peer["peerObject"].setLocalDescription(answer)

        websocketREF.current.send(JSON.stringify({ type: "sendAnswer", answer: answer, sender: idREF.current, target: target }))
    }


    useEffect(() => {
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        const websocket = new WebSocket(`${wsProtocol}//${window.location.host}`)

        websocketREF.current = websocket

        websocketREF.current = websocket

        websocket.addEventListener("open", () => {
            console.log("CLIENT : OPEN!")
            const randomid = GenerateRandomId()
            setUserId(randomid)
            idREF.current = randomid

            websocket.send(JSON.stringify({ type: "addUser", id: randomid }))
        })

        // CHANGED: was websocket.addEventListener("message", async (e) => {
        async function handleMessage(e) {
            const Data = JSON.parse(e.data)

            if (Data.type == "getPeers") {
                const PeerArray = []
                const otherPeers = Data.otherPeers.filter(user => user["id"] !== idREF.current)

                console.log(otherPeers)

                console.time("Camera initialization");
                const devices = await navigator.mediaDevices.enumerateDevices()
                const camera = devices.filter(device => device.kind == "videoinput" && device.label == "Integrated Camera (30c9:00ac)")
                const microphone = devices.filter(device => device.kind == "audioinput" && device.label == "Microphone Array (Realtek(R) Audio)")

                if (!localVideoREF.current?.srcObject) {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: camera[0].deviceId } }, audio: { deviceId: { exact: microphone[0].deviceId } } })
                    localStreamId.current = stream.id
                    localVideoREF.current.srcObject = stream
                    localStreamREF.current = stream

                    console.timeEnd("Camera initialization");
                }

                const response = await fetch("/getCredits")
                const data = await response.json()

                const peerconfig = {
                    iceServers: [
                        { urls: "stun:stun4.l.google.com:19302" },
                        {
                            urls: "turn:free.expressturn.com:3478",
                            username: data.username,
                            credential: data.password
                        }
                    ],
                }

                otherPeers.forEach(user => {
                    const peer = new RTCPeerConnection(peerconfig)

                    peer.oniceconnectionstatechange = () => {
                        console.log(user["id"], "ICE:", peer.iceConnectionState, "| conn:", peer.connectionState)
                    }

                    const dc = peer.createDataChannel("channel")

                    dc.onopen = () => {
                        console.log("data channel connected")
                    }

                    peer.onicecandidate = (e) => {
                        if (e.candidate) {
                            console.log("my candidate type:", e.candidate.type)
                            websocket.send(JSON.stringify({ type: "sendCandidate", candidate: e.candidate, callType: user["callType"], sender: idREF.current, target: user["id"] }))
                        }
                    }

                    localVideoREF.current?.srcObject.getTracks().forEach(track => {
                        peer.addTrack(track, localStreamREF.current)
                    })

                    peer.ontrack = (e) => {
                        const remoteStream = e.streams[0]

                        console.log("Track kind:", e.track.kind)
                        console.log("Streams:", e.streams)
                        console.log("Stream:", e.streams[0])

                        setRemoteStreams(prev => {
                            if (prev.some(s => s["stream"].id == remoteStream.id)) {
                                return prev
                            }
                            return [...prev, { stream: remoteStream, user_id: user["id"], muted: false }]
                        })
                    }

                    PeerArray.push({ peerObject: peer, id: user["id"] })
                });

                setPeerList(PeerArray)
                peerListREF.current = PeerArray

                PeerArray.map(async (peer) => {

                     if (idREF.current > peer.id) return

                     
                    const offer = await peer["peerObject"].createOffer()

                    const existingoffer = BufferingOffersREF.current.get(peer.id)

                    if (existingoffer) {
                        await handleOffer(peer["peerObject"], existingoffer.offer, idREF.current)
                        BufferingOffersREF.current.delete(peer.id)
                        return
                    }

                    await peer["peerObject"].setLocalDescription(offer)

                    websocket.send(JSON.stringify({ type: "sendOffer", offer: offer, sender: idREF.current, target: peer["id"] }))
                })
            }

            if (Data.type == "receiveCandidate") {
                const sendersPeer = peerListREF.current.find(peer => peer["id"] == Data.sender)

                if (sendersPeer) {
                    if (!sendersPeer["peerObject"]) {
                        BufferingOffersREF.current.set(Data.sender, Data.candidate)
                    }
                    await sendersPeer["peerObject"].addIceCandidate(Data.candidate)
                }
            }

            if (Data.type == "receiveOffer") {
                console.log(Data.sender)
                const sendersPeer = peerListREF.current.find(peer => peer["id"] == Data.sender)

                if (sendersPeer) {
                    if (!sendersPeer["peerObject"]) {
                        BufferingOffersREF.current.set(Data.sender, { offer: Data.offer })
                    }

                    acceptBufferingCandidates()
                    await handleOffer(sendersPeer, Data.offer, Data.sender)
                }
            }

            if (Data.type == "receiveAnswer") {
                console.log("answer received", Data.sender)
                const sendersPeer = peerListREF.current.find(peer => peer["id"] == Data.sender)

                if (sendersPeer && !sendersPeer["peerObject"].remoteDescription) {
                    await sendersPeer["peerObject"].setRemoteDescription(Data.answer)
                    acceptBufferingCandidates()
                }
            }

            if (Data.type == "onPeerLeave") {
                const getPeer = peerListREF.current.find(user => user["id"] == Data.id)
                if (getPeer) {
                    getPeer["peerObject"].close()
                    setRemoteStreams(prev => prev.filter(stream => stream["user_id"] !== Data.id))

                }
            }

            if (Data.type == "onPeerMute") {
                console.log(Data.target, "wants to be muted!")
                const getPeer = peerListREF.current.find(user => user["id"] == Data.target)
                if (getPeer) {
                    console.log("Found", Data.target)
                    setRemoteStreams((prev) =>
                        prev.map((peer) =>
                            peer.user_id === Data.target
                                ? { ...peer, muted: Data.mute }
                                : peer
                        )
                    );
                }
            }
        }
        // CHANGED: closing is now a plain } instead of })

        // NEW: the queue. Each message waits for the previous one to finish.
        websocket.addEventListener("message", (e) => {
            messgeQueueREF.current = (messgeQueueREF.current || Promise.resolve())
                .then(() => handleMessage(e))
                .catch(err => console.error(err))
        })

    }, [])


    return (
        <>
            <h1>Your ID : {userId}</h1>
            {incall ? (
                <>
                    <video ref={localVideoREF} autoPlay playsInline muted></video>
                    {remoteStreams.map((peer, index) => (
                        <>
                            <video key={index}
                                autoPlay
                                playsInline
                                ref={(video) => {
                                    if (video) {
                                        video.srcObject = peer["stream"]
                                        if (video.srcObject !== peer.stream) video.srcObject = peer.stream;
                                        video.muted = muteAll || peer.muted;
                                        // console.log("Video srcObject:", video.srcObject)
                                        // console.log("Video tracks:", video.srcObject.getTracks())
                                        // console.log("Video tracks only:", video.srcObject.getVideoTracks())
                                    }
                                }}
                            />
                            <p>ID : {peer.user_id}</p>
                            {peer["muted"] === false ? <p>Not muted</p> : <p>Muted</p>}
                        </>
                    ))}


                    <div>
                        <button onClick={Mute}>{mute === false ? "Mute" : "Unmute"}</button>
                        <button onClick={MuteAll}>{muteAll == false ? "Mute All" : "Unmute All"}</button>
                        <button onClick={Leave}>Leave call</button>
                    </div>
                </>
            ) : (
                <>
                    <button onClick={() => { setInCall(true), joinSingle() }}>Single Call</button>
                    <button onClick={() => { setInCall(true), joinGroup() }} >Group calls</button>
                </>
            )}
        </>
    )
}