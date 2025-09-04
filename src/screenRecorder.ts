export class ScreenRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private recordedBlobs: Blob[] = [];
    public localStream: MediaStream | null = null;
    private videoEl?: HTMLVideoElement | null;
    private options?: MediaRecorderOptions;
    private readonly videoQuerySelector?: string;
    private readonly debugMode: any;

    constructor(
        stream: MediaStream | null = null,
        props: {
            videoEl?: HTMLVideoElement;
            videoQuerySelector?: string;
            debugMode?: boolean;
            options?: MediaRecorderOptions;
        } = {}
    ) {
        this.videoEl = props.videoEl;
        this.videoQuerySelector = props.videoQuerySelector;
        this.debugMode = props.debugMode;
        this.localStream = stream;
        this.options = props.options;
    }

    public changeStream(stream: MediaStream) {
        this.localStream = stream;
        this.debug('stream changed', stream);
    }

    public debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(...args);
    }

    get activeInstance(): MediaRecorder | null {
        return this.mediaRecorder;
    }

    public changeMediaRecorderOptions(options: Partial<MediaRecorderOptions>) {
        this.options = { ...this.options, ...options };
        this.debug('change media recorder options', this.options);

        if (this.mediaRecorder?.state === 'recording') {
            this.debug(
                'Warning: could not initialize media recorder option while recording, can be setting only on start recording...'
            );
            console.log(
                'MediaRecorder Warning: could not initialize media recorder option while recording, can be setting only on start recording...'
            );
        }
    }

    public startRecording = (stream?: MediaStream) => {
        if (stream) this.changeStream(stream);

        if (!this.localStream) {
            this.debug('ERROR: Missing media stream!');
            throw new Error('Missing media stream!');
        }

        this.mediaRecorder = new MediaRecorder(this.localStream, this.options);
        this.debug('reset recording blobs data');
        this.recordedBlobs = [];

        this.mediaRecorder.ondataavailable = (e) => {
            this.debug('Data is available for the media recorder!');
            this.recordedBlobs.push(e.data);
        };

        this.debug('Start recording');
        this.mediaRecorder.start();
    };

    public stopRecording() {
        if (!this.mediaRecorder) {
            this.debug('Error: media recorder not initialized! Please record before stopping');
            throw new Error('Please record before stopping!');
        }
        if (this.mediaRecorder.state !== 'recording') {
            this.debug('Error: please recording before stopping!');
            throw new Error('Please recording before stopping!');
        }

        this.debug('stop recording');
        this.mediaRecorder.stop();
    }

    public pauseRecording() {
        if (!this.mediaRecorder) {
            this.debug('Error: media recorder not initialized! Please record before stopping');
            throw new Error('Please record before pausing!');
        }
        if (this.mediaRecorder.state !== 'recording') {
            this.debug('Error: please recording before pause!');
            throw new Error('Please recording before pause!');
        }

        this.debug('pause recording');
        this.mediaRecorder.pause();
    }

    public resumeRecording() {
        if (!this.mediaRecorder) {
            this.debug('Error: media recorder not initialized! Please record before stopping');
            throw new Error('Please record before resuming!');
        }
        if (this.mediaRecorder.state !== 'paused') {
            this.debug('Error: media recorder not paused please pause before resume!');
            throw new Error('Please pause before resuming!');
        }

        this.debug('resume recording');
        this.mediaRecorder.resume();
    }

    public async playRecording() {
        this.debug('play recording');
        if (!this.recordedBlobs?.length) {
            throw new Error('No Recording saved');
        }

        const superBuffer = new Blob(this.recordedBlobs);

        const recordedVideoEl = this.getVideoElement();
        if (!recordedVideoEl) {
            this.debug('Error: Recorded video element not found!');
            throw new Error('No video element found!');
        }

        recordedVideoEl.src = window.URL.createObjectURL(superBuffer);
        recordedVideoEl.controls = true;
        return recordedVideoEl.play();
    }

    private getVideoElement() {
        this.videoEl =
            this.videoEl ||
            (this.videoQuerySelector ? (document.querySelector(this.videoQuerySelector) as HTMLVideoElement) : null);

        return this.videoEl;
    }
}
