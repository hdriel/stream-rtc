export class StreamControls {
    public localStream: MediaStream | null = null;
    private videoEl?: HTMLVideoElement | null;
    private readonly videoQuerySelector?: string;
    private readonly debugMode: any;

    constructor(
        localStream: MediaStream | null,
        props: {
            videoEl?: HTMLVideoElement;
            videoQuerySelector?: string;
            debugMode?: boolean;
        } = {}
    ) {
        this.localStream = localStream;
        this.videoEl = props.videoEl;
        this.videoQuerySelector = props.videoQuerySelector;
        this.debugMode = props.debugMode;
    }

    public debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(...args);
    }

    get stream() {
        return this.localStream;
    }

    async getDevices(): Promise<Record<MediaDeviceKind, MediaDeviceInfo[]>> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.debug('getDevices', devices);

            return devices.reduce(
                (obj, deviceInfo) => {
                    obj[deviceInfo.kind].push(deviceInfo);
                    return obj;
                },
                {
                    audioinput: [],
                    audiooutput: [],
                    videoinput: [],
                } as Record<MediaDeviceKind, MediaDeviceInfo[]>
            );
        } catch (err) {
            this.debug('ERROR: getDevices failed with error', err);
            throw err;
        }
    }

    async getDevicesListByKind(kind?: MediaDeviceKind | MediaDeviceKind[]) {
        try {
            const kinds = ([] as MediaDeviceKind[]).concat(kind as MediaDeviceKind).filter((v) => v);

            const devices = await navigator.mediaDevices.enumerateDevices();
            this.debug('getDevices(' + kind ? `kind=${kind})` : ')', devices);

            return kinds?.length ? devices.filter((deviceInfo) => kinds.includes(deviceInfo.kind)) : devices;
        } catch (err) {
            this.debug('ERROR: getDevices failed with error', err);
            throw err;
        }
    }

    async changeAudioInput(deviceId: string) {
        const newConstraints = {
            audio: { deviceId: { exact: deviceId } },
            video: true,
        };

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(newConstraints);
            this.debug('change audio input stream', this.localStream);
            if (this.debugMode) {
                const tracks = this.localStream.getAudioTracks();
                this.debug('stream tracks', tracks);
            }
        } catch (err) {
            this.debug('ERROR: failed to change audio input stream', err);
            throw new Error('StreamControls Error' + err);
        }
    }

    async changeAudioOutput(deviceId: string) {
        const videoEl = this.getVideoElement();
        if (!videoEl) {
            this.debug('Warning: video element not found!');
            throw 'Error: video element not found!';
        }

        await videoEl?.setSinkId(deviceId);
        this.debug('Changed audio device!');
    }

    getAudioTracks(): MediaStreamTrack[] {
        if (!this.localStream) {
            throw Error('No stream found');
        }

        const result = this.localStream.getAudioTracks();
        this.debug('getAudioTracks', result);

        return result;
    }

    addTrack(track: MediaStreamTrack) {
        if (!this.localStream) {
            throw Error('No stream found');
        }

        this.debug('addTrack', track);

        return this.localStream.addTrack(track);
    }

    getTracks(): MediaStreamTrack[] {
        if (!this.localStream) {
            throw Error('No stream found');
        }

        const result = this.localStream.getTracks();
        this.debug('getTracks', result);

        return result;
    }

    getTrackById(trackId: string): MediaStreamTrack | null {
        if (!this.localStream) {
            throw Error('No stream found');
        }

        const result = this.localStream.getTrackById(trackId);
        this.debug(`getTrackById(${trackId})`, result);

        return result;
    }

    getVideoTracks(): MediaStreamTrack[] {
        if (!this.localStream) {
            throw Error('No stream found');
        }

        const result = this.localStream.getVideoTracks();
        this.debug('getVideoTracks', result);

        return result;
    }

    private getVideoElement() {
        this.videoEl =
            this.videoEl ||
            (this.videoQuerySelector ? (document.querySelector(this.videoQuerySelector) as HTMLVideoElement) : null);

        return this.videoEl;
    }

    async changeVideoSize(
        options: Omit<Partial<MediaTrackConstraints>, 'height' | 'width'> & { height?: number; width?: number }
    ) {
        if (!this.localStream) {
            throw Error('No stream found');
        }

        const { height, width, ...restOptions } = options;

        return Promise.allSettled(
            this.localStream?.getVideoTracks().map((track) => {
                const capabilities = track.getCapabilities();
                const { height: { max: capabilityMaxHeight } = {}, width: { max: capabilityMaxWidth } = {} } =
                    capabilities;

                const vConstraints = {
                    ...restOptions,
                    ...(height && capabilityMaxHeight
                        ? { height: { exact: height < capabilityMaxHeight ? height : capabilityMaxHeight } }
                        : { height }),
                    ...(width && capabilityMaxWidth
                        ? { width: { exact: width < capabilityMaxWidth ? width : capabilityMaxWidth } }
                        : { width }),
                };

                return track.applyConstraints(vConstraints);
            })
        );
    }
}
