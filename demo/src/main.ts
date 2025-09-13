import('./script1');
// import('./script2');
// import('./script3');
// import('./script4');
// import('./script5');

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div class="container">     
      <h1 id="use-case">case</h1>
      <button id="join-room" class="btn btn-primary col-1" hidden>Join</button>
      
      
      <div class="row mb-3 mt-3 justify-content-md-center">
        <div id="user-name"></div>
        <button id="call" class="btn btn-primary col-1">Call!</button>
        <button id="hangup" class="col-1" class="btn btn-primary">Hangup</button>
        <div id="answer" class="col-10"></div>
      </div>
      <div id="videos">
        <div id="video-wrapper">
          <div id="waiting" class="btn btn-warning">Waiting for answer...</div>
          <video class="video-player" id="local-video" autoplay playsinline ></video>
        </div>
        <video class="video-player" id="remote-video" autoplay playsinline ></video>
      </div>
    </div>
`;
