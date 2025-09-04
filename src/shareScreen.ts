export class ShareScreen {
    public localStream: MediaStream | null = null;
    private options?: DisplayMediaStreamOptions;
    private videoEl?: HTMLVideoElement | null;
    private readonly videoQuerySelector?: string;
    private readonly debugMode: any;

    constructor(
        props: {
            videoEl?: HTMLVideoElement;
            videoQuerySelector?: string;
            debugMode?: boolean;
            options?: DisplayMediaStreamOptions;
        } = {
            debugMode: false,
            options: { video: true, audio: false },
        }
    ) {
        this.videoEl = props.videoEl;
        this.videoQuerySelector = props.videoQuerySelector;
        this.debugMode = props.debugMode;

        // surfaceSwitching: 'include', //include/exclude NOT true/false
        this.options = { video: true, audio: false, ...props.options };
    }

    public debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(...args);
    }

    public changeShareScreenOptions(options: Partial<DisplayMediaStreamOptions>) {
        this.options = { ...this.options, ...options };
        this.debug('change media recorder options', this.options);
    }

    public async share() {
        this.debug('play recording');

        const recordedVideoEl = this.getVideoElement();
        if (!recordedVideoEl) {
            this.debug('Error: ShareScreen video element not found!');
            console.warn('ShareScreen: No video element found to streaming sharing stream');
        }

        try {
            this.localStream = await navigator.mediaDevices.getDisplayMedia(this.options);
            if (recordedVideoEl) recordedVideoEl.srcObject = this.localStream;
        } catch (err) {
            this.debug('Error: Could not share screen', err);
            console.warn('ShareScreen: failed to share screen', err);
        }

        return this.localStream;
    }

    private getVideoElement() {
        this.videoEl =
            this.videoEl ||
            (this.videoQuerySelector ? (document.querySelector(this.videoQuerySelector) as HTMLVideoElement) : null);

        return this.videoEl;
    }
}
