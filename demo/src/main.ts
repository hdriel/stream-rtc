import('./script-user-rtc');
// import('./script-room-rtc');

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div class="container">     
      <h1 id="use-case">case</h1>
      <button id="join-room" class="btn btn-primary col-1" hidden>Join</button>
      
      
      <div id="actions" class="row mb-3 mt-3 justify-content-around">
        <div id="user-name"></div>
        <div id="answer" class="col-12"></div>      
        <button id="hangup" class="btn btn-danger col-1">Hangup All</button>
<!--        <button id="call" class="btn btn-primary col-1">Call!</button> -->
      </div>
      <div id="videos">
        <div id="video-wrapper">
          <div id="waiting" class="btn btn-warning">Waiting for answer...</div>
          <div style="display: contents" class="video-container" id="local-video-container">         
            <video class="video-player" id="local-video" autoplay playsinline ></video>
            <div class="video-label me">test</div>
          </div>
        </div>
      </div>
    </div>
`;
