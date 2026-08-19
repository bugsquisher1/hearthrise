// src/render/objectives-popout.js — Profile "Objectives" popout overlay (render layer)
// Nth render-layer strangler-fig extraction out of src/legacy.js (task #129).
// PURE REFACTOR — identical DOM + behaviour to legacy.js openObjectivesPopout.
//
// Read-only: mirrors the innerHTML of the existing #dash-objectives card into a
// modal popout. Writes no authoritative game state. Its sole caller is
// buildProfileToolbar (still in legacy.js), which wires it via
// addEventListener('click', openObjectivesPopout) — a bare identifier that
// resolves to the global re-exported below, so load order is free.
// CSS (.prof-popout*) is already tokenised in src/styles/legacy.css; left in place
// because the classes are shared popout chrome.
(function () {
  'use strict';

  function openObjectivesPopout(){
    var ov = document.getElementById('prof-pop-objectives');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'prof-pop-objectives'; ov.className = 'prof-popout';
      ov.innerHTML = '<div class="prof-popout-inner" onclick="event.stopPropagation()">'+
        '<h3>📋 Objectives</h3>'+
        '<div id="prof-pop-objectives-body"></div>'+
        '<button class="prof-popout-close" onclick="document.getElementById(\'prof-pop-objectives\').classList.remove(\'show\')">Close</button>'+
        '</div>';
      ov.addEventListener('click', function(e){if(e.target===ov) ov.classList.remove('show');});
      document.body.appendChild(ov);
    }
    /* Populate body with objectives content from the original dash-objectives card */
    var body = document.getElementById('prof-pop-objectives-body');
    var orig = document.getElementById('dash-objectives');
    body.innerHTML = orig ? orig.innerHTML : '<div class="muted">No objectives loaded.</div>';
    ov.classList.add('show');
  }
  window.openObjectivesPopout = openObjectivesPopout;
})();
