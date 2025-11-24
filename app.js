</script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js"></script>
</head>
<body>
<div id="app" class="app-wrap">
  <div style="min-height:60vh;display:flex;align-items:center;justify-content:center">
    <div class="card text-center" style="max-width:420px">
      <div style="width:48px;height:48px;border-radius:12px;background:var(--indigo);color:white;margin:0 auto;display:flex;align-items:center;justify-content:center;font-weight:700;">SH</div>
      <h2 style="margin-top:12px">Student Hub</h2>
      <p class="muted">Loading…</p>
    </div>
  </div>
</div>

<!-- modal -->
<div id="modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);align-items:center;justify-content:center;z-index:1200">
  <div style="background:white;padding:16px;border-radius:10px;width:min(720px,96%);max-height:90vh;overflow:auto">
    <div id="modal-body"></div>
    <div style="text-align:right;margin-top:12px"><button id="modal-close" class="btn btn-ghost">Close</button></div>
  </div>
</div>

<script>
/* ---------- Firebase config (from you) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCfijY0V4DQDOkrb13ludHiGRFtWsk8Bsg",
  authDomain: "student-hub-450ab.firebaseapp.com",
  databaseURL: "https://student-hub-450ab-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "student-hub-450ab",
  storageBucket: "student-hub-450ab.firebasestorage.app",
  messagingSenderId: "149361370872",
  appId: "1:149361370872:web:e3ee75310e59d92f3bbd0d",
  measurementId: "G-52487TXWN7"
};
/* ------------------------------------------------ */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

/* ---------------- App state ---------------- */
let me = null;
let myClasses = [];      // array of class info objects the user is in
let currentClass = null; // object { id, name, inviteCode }
let classChannels = [];  // channels in current class
let currentChannel = null; // { id, name }
let channelMessagesRef = null, channelMessagesListener = null;
let typingRef = null;
let presenceRef = null, presenceListener = null;
let groups = []; // groups array for class
let currentGroupId = null, groupMessagesRef = null, groupMessagesListener = null;

/* ---------------- Helpers ---------------- */
function $(id){ return document.getElementById(id); }
function showModal(html){
  $('modal-body').innerHTML = html;
  $('modal').style.display = 'flex';
}
function closeModal(){ $('modal').style.display = 'none'; }
$('modal-close').onclick = closeModal;
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"'`]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[ch])); }

/* ---------------- Render top-level view ---------------- */
function render(){
  const app = $('app');
  if(!me){
    app.innerHTML = renderAuthView();
    attachAuthHandlers();
    return;
  }
  if(!currentClass){
    app.innerHTML = renderClassSelectionView();
    attachClassSelectionHandlers();
    // load user's classes
    loadUserClassesRealtime();
    return;
  }
  // inside class
  app.innerHTML = renderClassView();
  attachClassViewHandlers();
  loadClassRealtimeData(currentClass.id);
  setupPresence(currentClass.id);
}

/* ---------------- Auth view ---------------- */
function renderAuthView(){
  return `
    <div style="min-height:80vh;display:flex;align-items:center;justify-content:center;padding:12px">
      <div class="card" style="max-width:720px;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="padding:18px;">
          <h2>Welcome to Student Hub</h2>
          <p class="small">Student-run classes: create a class, join with a code, share deadlines, ask homework questions, chat in real-time and form project groups — all kept inside each class.</p>
          <div style="margin-top:12px">
            <button id="show-login" class="btn btn-primary" style="width:100%;margin-bottom:8px">Login</button>
            <button id="show-signup" class="btn btn-ghost" style="width:100%">Sign up</button>
          </div>
          <p class="small" style="margin-top:14px">Firebase project: <strong>${escapeHtml(firebaseConfig.projectId)}</strong></p>
        </div>
        <div style="padding:18px;border-left:1px solid #f1f5f9;">
          <div id="auth-forms">${renderLoginForm()}</div>
        </div>
      </div>
    </div>
  `;
}
function renderLoginForm(){
  return `
    <h3>Login</h3>
    <input id="login-email" type="email" placeholder="Email" style="width:100%;margin-top:8px" />
    <input id="login-pass" type="password" placeholder="Password" style="width:100%;margin-top:8px" />
    <div style="margin-top:12px;display:flex;gap:8px">
      <button id="login-submit" class="btn btn-primary">Login</button>
      <button id="login-demo" class="btn btn-ghost">Create demo</button>
    </div>
    <hr style="margin-top:12px"/>
    ${renderSignupFormSmall()}
  `;
}
function renderSignupFormSmall(){
  return `
    <h4 style="margin-top:6px">Sign up</h4>
    <input id="signup-name" placeholder="Full name" style="width:100%;margin-top:8px" />
    <input id="signup-email" type="email" placeholder="Email" style="width:100%;margin-top:8px" />
    <input id="signup-pass" type="password" placeholder="Password (min 6)" style="width:100%;margin-top:8px" />
    <div style="text-align:right;margin-top:8px">
      <button id="signup-submit" class="btn btn-primary">Create account</button>
    </div>
  `;
}
function attachAuthHandlers(){
  const showLogin = $('show-login');
  const showSignup = $('show-signup');
  if(showLogin) showLogin.onclick = ()=> { $('auth-forms').innerHTML = renderLoginForm(); attachAuthHandlers(); };
  if(showSignup) showSignup.onclick = ()=> { $('auth-forms').innerHTML = renderSignupFormSmall(); attachAuthHandlers(); };

  const loginSubmit = $('login-submit');
  if(loginSubmit) loginSubmit.onclick = ()=>{
    const email = $('login-email').value.trim();
    const pass = $('login-pass').value;
    if(!email || !pass) return alert('Fill email and password');
    auth.signInWithEmailAndPassword(email, pass).catch(e=> alert(e.message));
  };

  const loginDemo = $('login-demo');
  if(loginDemo) loginDemo.onclick = ()=>{
    // create a demo account (if not exists) so you can test quickly; demo account is not persistent across project resets
    const demoEmail = 'demo_student@example.com';
    const demoPass = 'password123';
    auth.signInWithEmailAndPassword(demoEmail, demoPass).catch(e=>{
      // if not exist, create demo
      auth.createUserWithEmailAndPassword(demoEmail, demoPass)
        .then(uc => uc.user.updateProfile({ displayName: 'Demo Student' }))
        .catch(err => alert(err.message));
    });
  };

  const signup = $('signup-submit');
  if(signup) signup.onclick = ()=>{
    const name = $('signup-name').value.trim();
    const email = $('signup-email').value.trim();
    const pass = $('signup-pass').value;
    if(!name || !email || !pass) return alert('Fill all fields');
    if(pass.length < 6) return alert('Password must be at least 6 characters');
    auth.createUserWithEmailAndPassword(email, pass)
      .then(uc => uc.user.updateProfile({ displayName: name }))
      .catch(e => alert(e.message));
  };
}

/* ---------------- Class selection view ---------------- */
function renderClassSelectionView(){
  return `
    <div class="grid-2">
      <div class="card sidebar">
        <div class="logo">
          <div class="avatar">${escapeHtml((me.displayName||me.email).charAt(0).toUpperCase())}</div>
          <div>
            <div style="font-weight:700">${escapeHtml(me.displayName || me.email.split('@')[0])}</div>
            <div class="small">${escapeHtml(me.email)}</div>
          </div>
        </div>

        <div style="margin-top:8px;display:flex;gap:8px">
          <button id="create-class" class="btn btn-primary" style="flex:1">+ Create Class</button>
          <button id="join-class" class="btn btn-ghost" style="flex:1">Join</button>
        </div>

        <h4 style="margin-top:12px">Your classes</h4>
        <div class="list" id="classes-list"></div>

        <div style="margin-top:auto">
          <div class="small" id="home-presence">Not in a class</div>
          <div style="margin-top:8px"><button id="logout" class="btn btn-ghost">Logout</button></div>
        </div>
      </div>

      <div class="card" style="padding:18px">
        <h2>Welcome, ${escapeHtml(me.displayName || me.email.split('@')[0])}</h2>
        <p class="small">Create or join your class. Inside each class you'll find Deadlines, Homework Help, Channels (chat) and Groups.</p>
        <div style="margin-top:16px" id="classes-preview"></div>
      </div>
    </div>
  `;
}
function attachClassSelectionHandlers(){
  $('create-class').onclick = ()=> {
    showModal(`<h3>Create Class</h3>
      <input id="modal-class-name" placeholder="Class name (e.g., 3A)" style="width:100%;padding:8px;margin-top:8px" />
      <div style="text-align:right;margin-top:8px"><button id="modal-create" class="btn btn-primary">Create</button></div>`);
    $('modal-create').onclick = ()=>{
      const name = $('modal-class-name').value.trim();
      if(!name) return alert('Enter class name');
      createClass(name);
      closeModal();
    };
  };

  $('join-class').onclick = ()=> {
    const code = prompt('Enter invite code (case-insensitive):');
    if(!code) return;
    joinClassWithCode(code.trim().toUpperCase());
  };

  $('logout').onclick = ()=> {
    // ensure proper cleanup and return to auth view
    cleanupAllListeners();
    auth.signOut().catch(e=> console.error(e));
  };

  renderUserClassesList();
}

/* --------- Create / Join / Load user classes ---------- */
function createClass(name){
  const id = Date.now().toString();
  const inviteCode = Math.random().toString(36).substring(2,8).toUpperCase();
  const info = { id, name, inviteCode, createdBy: me.uid, createdAt: Date.now() };
  const updates = {};
  updates[`/classes/${id}/info`] = info;
  updates[`/classes/${id}/members/${me.uid}`] = true;
  updates[`/users/${me.uid}/classesJoined/${id}`] = true;
  db.ref().update(updates)
    .then(()=> {
      loadUserClassesRealtime();
      // auto-enter newly created class
      currentClass = info;
      render();
    })
    .catch(e=> alert(e.message));
}

function joinClassWithCode(code){
  if(!code) return;
  // query classes by info/inviteCode
  db.ref('classes').orderByChild('info/inviteCode').equalTo(code).once('value')
    .then(snap=>{
      if(!snap.exists()) return alert('Invalid invite code');
      // there may be one or more matches; join the first
      let joined = false;
      snap.forEach(child=>{
        const data = child.val();
        const info = (data.info) ? data.info : data;
        const id = info.id;
        // add member and user mapping
        const updates = {};
        updates[`/classes/${id}/members/${me.uid}`] = true;
        updates[`/users/${me.uid}/classesJoined/${id}`] = true;
        db.ref().update(updates).then(()=> {
          joined = true;
          loadUserClassesRealtime();
          alert('Joined ' + info.name);
        }).catch(e=> alert(e.message));
      });
      if(!joined) alert('Failed to join — try again');
    }).catch(e=> alert(e.message));
}

function loadUserClassesRealtime(){
  if(!me) return;
  const ref = db.ref(`users/${me.uid}/classesJoined`);
  ref.off();
  ref.on('value', snap=>{
    const val = snap.val() || {};
    // val is an object of classId: true or full info depending on writes; try to resolve to class info
    const ids = Object.keys(val);
    if(ids.length===0){
      myClasses = [];
      renderUserClassesList();
      return;
    }
    // get class info for each id
    const promises = ids.map(id => db.ref(`classes/${id}/info`).once('value').then(s=> s.val()));
    Promise.all(promises).then(results => {
      myClasses = results.filter(Boolean);
      renderUserClassesList();
    }).catch(err => {
      console.error('Error loading classes info', err);
    });
  });
}

function renderUserClassesList(){
  const container = $('classes-list');
  if(!container) return;
  container.innerHTML = '';
  if(myClasses.length === 0){
    container.innerHTML = '<div class="small">You are not in any classes yet.</div>';
    return;
  }
  myClasses.forEach(c=>{
    const el = document.createElement('div');
    el.className = 'class-item card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700">${escapeHtml(c.name)}</div>
        <div class="small">Code: ${escapeHtml(c.inviteCode || '')}</div>
      </div>
      <div style="text-align:right">
        <div class="small">Members: —</div>
        <div style="margin-top:8px"><button class="inline-btn" onclick="event.stopPropagation(); copyInvite('${escapeHtml(c.inviteCode||'')}')">Copy</button></div>
      </div>
    </div>`;
    el.onclick = ()=> {
      enterClass(c);
    };
    container.appendChild(el);
  });
}
function copyInvite(code){ navigator.clipboard.writeText(code||''); alert('Code copied'); }

/* ---------------- Enter / leave class ---------------- */
function enterClass(c){
  cleanupClassListeners(); // clear any previous class listeners
  currentClass = c;
  render();
}
function leaveClass(){
  if(!currentClass) return;
  // remove membership mapping from user's classesJoined if user confirmed leaving
  if(confirm('Leave this class? This removes it from your classes list.')) {
    db.ref(`users/${me.uid}/classesJoined/${currentClass.id}`).remove().then(()=> {
      cleanupClassListeners();
      currentClass = null;
      render();
    }).catch(e=> alert(e.message));
  }
}

/* ---------------- Class view ---------------- */
function renderClassView(){
  const classTitle = escapeHtml(currentClass.name);
  return `
  <div class="grid-2">
    <div class="card sidebar">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar">${escapeHtml((me.displayName||me.email).charAt(0).toUpperCase())}</div>
        <div>
          <div style="font-weight:700">${classTitle}</div>
          <div class="small">You: ${escapeHtml(me.displayName || me.email.split('@')[0])}</div>
        </div>
      </div>

      <div style="margin-top:12px">
        <div class="tabs">
          <button class="tab-btn active" data-tab="deadlines">📅 Deadlines</button>
          <button class="tab-btn" data-tab="homework">❓ Homework Help</button>
          <button class="tab-btn" data-tab="channels">💬 Channels</button>
          <button class="tab-btn" data-tab="groups">👥 Groups</button>
        </div>
      </div>

      <div id="sidebar-actions" style="margin-top:12px">
        <button id="invite-btn" class="btn btn-primary" style="width:100%">Invite (Code)</button>
        <button id="back-classes" class="btn btn-ghost" style="width:100%;margin-top:8px">Back to classes</button>
      </div>

      <div style="margin-top:auto">
        <div class="small" id="class-presence">Online: —</div>
        <div style="margin-top:8px"><button id="leave-class" class="btn btn-ghost">Leave class</button></div>
        <div style="margin-top:8px"><button id="logout2" class="btn btn-ghost">Logout</button></div>
      </div>
    </div>

    <div class="card main card-scroll" style="padding:16px">
      <div id="tab-deadlines" class="tab-content">
        <h2>Deadlines</h2>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input id="deadline-title" placeholder="Title" style="flex:1" />
          <input id="deadline-date" type="date" />
          <input id="deadline-subject" placeholder="Subject (optional)" style="width:160px" />
          <button id="add-deadline" class="btn btn-primary">Add</button>
        </div>
        <div id="deadlines-list"></div>
      </div>

      <div id="tab-homework" class="tab-content" style="display:none">
        <h2>Homework Help</h2>
        <div style="margin-bottom:12px" class="post">
          <input id="post-title" placeholder="Question title" style="width:100%;margin-bottom:8px" />
          <textarea id="post-desc" placeholder="Describe your question..." style="width:100%"></textarea>
          <div style="text-align:right;margin-top:8px">
            <button id="add-post" class="btn btn-primary">Post Question</button>
          </div>
        </div>
        <div id="posts-list"></div>
      </div>

      <div id="tab-channels" class="tab-content" style="display:none">
        <h2>Channels (class chat)</h2>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="channel-name" placeholder="New channel name" />
          <button id="create-channel" class="btn btn-primary">Create</button>
        </div>
        <div style="display:flex;gap:12px">
          <div style="width:240px">
            <div id="channels-list" class="card card-scroll"></div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column">
            <div id="channel-header" style="display:flex;justify-content:space-between;align-items:center">
              <div><strong id="channel-title">Select a channel</strong><div class="small" id="channel-sub"></div></div>
              <div class="small" id="channel-online">Online: —</div>
            </div>
            <div id="channel-messages" class="chat-area card-scroll" style="margin-top:8px"></div>
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
              <input id="channel-input" placeholder="Message" disabled />
              <button id="channel-send" class="btn btn-primary" disabled>Send</button>
            </div>
            <div class="small muted" id="channel-typing"></div>
          </div>
        </div>
      </div>

      <div id="tab-groups" class="tab-content" style="display:none">
        <h2>Groups (project groups with mini-chat)</h2>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="group-name" placeholder="Group name" />
          <input id="group-time" placeholder="Meeting time (optional)" />
          <button id="create-group" class="btn btn-primary">Create Group</button>
        </div>
        <div id="groups-list"></div>

        <hr/>
        <div id="group-chat-area" style="display:none">
          <h3 id="group-chat-title"></h3>
          <div id="group-chat-messages" class="chat-area card-scroll"></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input id="group-chat-input" placeholder="Message" />
            <button id="group-chat-send" class="btn btn-primary">Send</button>
          </div>
          <div class="small muted" id="group-typing"></div>
          <div style="margin-top:8px"><button id="close-group-chat" class="btn btn-ghost">Close chat</button></div>
        </div>
      </div>
    </div>
  </div>
  `;
}

/* ---------------- Class realtime data (deadlines/posts/channels/groups) ---------------- */
function loadClassRealtimeData(classId){
  // Deadlines
  const deadlinesRef = db.ref(`classes/${classId}/deadlines`);
  deadlinesRef.off();
  deadlinesRef.on('value', snap=>{
    const val = snap.val() || {};
    const arr = Object.values(val).sort((a,b)=>a.createdAt - b.createdAt);
    renderDeadlines(arr);
  });

  // Posts + replies
  const postsRef = db.ref(`classes/${classId}/posts`);
  postsRef.off();
  postsRef.on('value', snap=>{
    const val = snap.val() || {};
    const arr = Object.values(val).sort((a,b)=>b.timestamp - a.timestamp);
    renderPosts(arr);
  });

  // Channels list
  const channelsRef = db.ref(`classes/${classId}/chatChannels`);
  channelsRef.off();
  channelsRef.on('value', snap=>{
    const val = snap.val() || {};
    // each channel stored as { id: { info: {...} } } or info directly; keep flexible
    classChannels = Object.keys(val).map(k => (val[k].info ? val[k].info : (val[k].id ? val[k] : { id: k, name: (val[k].name || k) })));
    // ensure general exists
    if(!classChannels.find(ch => ch.name === 'general')){
      const info = { id: 'general', name: 'general', createdAt: Date.now(), createdBy: me.uid };
      db.ref(`classes/${classId}/chatChannels/general/info`).set(info).catch(()=>{});
      return;
    }
    renderChannelsList();
    // auto-select first channel if none
    if(classChannels.length > 0 && !currentChannel){
      selectChannel(classChannels[0].id);
    }
  });

  // Groups
  const groupsRef = db.ref(`classes/${classId}/groups`);
  groupsRef.off();
  groupsRef.on('value', snap=>{
    const val = snap.val() || {};
    groups = Object.values(val);
    renderGroupsList();
  });
}

/* ---------------- Deadlines ---------------- */
function renderDeadlines(list){
  const container = $('deadlines-list');
  if(!container) return;
  container.innerHTML = '';
  if(list.length === 0){ container.innerHTML = '<div class="small muted">No deadlines yet.</div>'; return; }
  list.forEach(d=>{
    const el = document.createElement('div');
    el.className = 'deadline';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700">${escapeHtml(d.title)}</div>
        <div class="small">${escapeHtml(d.subject||'')}</div>
      </div>
      <div style="text-align:right">
        <div class="small">Due: <strong>${escapeHtml(d.date)}</strong></div>
        <div style="margin-top:8px">
          <button class="inline-btn" onclick="editDeadline('${escapeHtml(d.id)}')">Edit</button>
          <button class="inline-btn" onclick="deleteDeadline('${escapeHtml(d.id)}')">Delete</button>
        </div>
      </div>
    </div>`;
    container.appendChild(el);
  });
}

function addDeadline(){
  const title = $('deadline-title').value.trim();
  const date = $('deadline-date').value;
  const subject = $('deadline-subject').value.trim();
  if(!title || !date) return alert('Enter title and date');
  const id = Date.now().toString();
  const payload = { id, title, date, subject, addedBy: me.uid, createdAt: Date.now() };
  db.ref(`classes/${currentClass.id}/deadlines/${id}`).set(payload).then(()=> {
    $('deadline-title').value=''; $('deadline-date').value=''; $('deadline-subject').value='';
  }).catch(e=> alert(e.message));
}

function editDeadline(id){
  const ref = db.ref(`classes/${currentClass.id}/deadlines/${id}`);
  ref.once('value').then(snap=>{
    const d = snap.val();
    if(!d) return alert('Deadline not found');
    showModal(`
      <h3>Edit deadline</h3>
      <input id="edit-deadline-title" value="${escapeHtml(d.title)}" style="width:100%;margin-top:8px" />
      <input id="edit-deadline-date" type="date" value="${escapeHtml(d.date)}" style="width:100%;margin-top:8px" />
      <input id="edit-deadline-subj" value="${escapeHtml(d.subject||'')}" style="width:100%;margin-top:8px" />
      <div style="text-align:right;margin-top:8px"><button id="save-deadline" class="btn btn-primary">Save</button></div>
    `);
    $('save-deadline').onclick = ()=>{
      const title = $('edit-deadline-title').value.trim();
      const date = $('edit-deadline-date').value;
      const subj = $('edit-deadline-subj').value.trim();
      if(!title || !date) return alert('Fill title and date');
      db.ref(`classes/${currentClass.id}/deadlines/${id}`).update({ title, date, subject: subj });
      closeModal();
    };
  }).catch(e=> alert(e.message));
}

function deleteDeadline(id){
  if(!confirm('Delete this deadline?')) return;
  db.ref(`classes/${currentClass.id}/deadlines/${id}`).remove().catch(e=> alert(e.message));
}

/* ---------------- Posts (homework Q&A) ---------------- */
function renderPosts(list){
  const container = $('posts-list');
  if(!container) return;
  container.innerHTML = '';
  if(list.length === 0){ container.innerHTML = '<div class="small muted">No questions yet.</div>'; return; }
  list.forEach(p=>{
    const el = document.createElement('div');
    el.className = 'post';
    el.innerHTML = `<div style="display:flex;justify-content:space-between">
      <div><strong>${escapeHtml(p.title)}</strong><div class="small">By ${escapeHtml(p.authorName || 'Unknown')}</div></div>
      <div class="small">${new Date(p.timestamp).toLocaleString()}</div>
    </div>
    <div style="margin-top:8px">${escapeHtml(p.description || '')}</div>
    <div style="margin-top:8px" id="replies-${p.id}"></div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <input id="reply-input-${p.id}" placeholder="Write a reply..." />
      <button class="btn btn-primary" onclick="addReply('${escapeHtml(p.id)}')">Reply</button>
      ${p.authorId === me.uid ? `<button class="inline-btn" onclick="deletePost('${escapeHtml(p.id)}')">Delete post</button>` : ''}
    </div>`;
    container.appendChild(el);

    // listen replies for this post
    const rref = db.ref(`classes/${currentClass.id}/posts/${p.id}/answers`);
    rref.off();
    rref.on('value', snap=>{
      const val = snap.val() || {};
      const arr = Object.values(val).sort((a,b)=>a.timestamp - b.timestamp);
      const repEl = document.getElementById(`replies-${p.id}`);
      if(repEl){
        repEl.innerHTML = arr.map(r=>{
          return `<div class="reply"><div style="display:flex;justify-content:space-between"><strong>${escapeHtml(r.authorName)}</strong><div class="small">${new Date(r.timestamp).toLocaleString()}</div></div><div style="margin-top:6px">${escapeHtml(r.text)}</div>${r.authorId === me.uid ? '<div style="margin-top:6px"><button class="inline-btn" onclick="deleteReply(\\'${escapeHtml(p.id)}\\',\\'${escapeHtml(r.id)}\\')">Delete</button></div>' : ''}</div>`;
        }).join('');
      }
    });
  });
}

function addPost(){
  const title = $('post-title').value.trim();
  const desc = $('post-desc').value.trim();
  if(!title) return alert('Enter title');
  const id = Date.now().toString();
  const payload = { id, title, description: desc, authorId: me.uid, authorName: me.displayName || me.email.split('@')[0], timestamp: Date.now() };
  db.ref(`classes/${currentClass.id}/posts/${id}`).set(payload).then(()=> {
    $('post-title').value=''; $('post-desc').value='';
  }).catch(e=> alert(e.message));
}

function addReply(postId){
  const input = $(`reply-input-${postId}`);
  if(!input) return;
  const text = input.value.trim();
  if(!text) return alert('Enter reply');
  const id = Date.now().toString() + '-' + Math.random().toString(36).slice(2,5);
  const payload = { id, text, authorId: me.uid, authorName: me.displayName || me.email.split('@')[0], timestamp: Date.now() };
  db.ref(`classes/${currentClass.id}/posts/${postId}/answers/${id}`).set(payload).then(()=> {
    input.value = '';
  }).catch(e=> alert(e.message));
}

function deletePost(postId){
  if(!confirm('Delete your post?')) return;
  // client shows delete only for owners but double-check when removing
  db.ref(`classes/${currentClass.id}/posts/${postId}`).once('value').then(snap=>{
    const p = snap.val();
    if(!p) return alert('Post not found');
    if(p.authorId !== me.uid) return alert('You can only delete your own post');
    db.ref(`classes/${currentClass.id}/posts/${postId}`).remove().catch(e=> alert(e.message));
  });
}

function deleteReply(postId, replyId){
  if(!confirm('Delete your reply?')) return;
  db.ref(`classes/${currentClass.id}/posts/${postId}/answers/${replyId}`).once('value').then(snap=>{
    const r = snap.val();
    if(!r) return alert('Reply not found');
    if(r.authorId !== me.uid) return alert('You can only delete your own reply');
    db.ref(`classes/${currentClass.id}/posts/${postId}/answers/${replyId}`).remove().catch(e=> alert(e.message));
  });
}

/* ---------------- Channels (class chat) ---------------- */
function renderChannelsList(){
  const container = $('channels-list');
  if(!container) return;
  container.innerHTML = '';
  classChannels.forEach(ch=>{
    const el = document.createElement('div');
    el.className = 'channel card';
    if(currentChannel && currentChannel.id === ch.id) el.classList.add('active');
    el.textContent = '# ' + ch.name;
    el.onclick = ()=> selectChannel(ch.id);
    container.appendChild(el);
  });
}

function createChannel(){
  const name = $('channel-name').value.trim();
  if(!name) return alert('Enter channel name');
  const chId = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-_]/g,'') + '-' + Date.now().toString().slice(-4);
  const info = { id: chId, name, createdBy: me.uid, createdAt: Date.now() };
  db.ref(`classes/${currentClass.id}/chatChannels/${chId}/info`).set(info).then(()=> { $('channel-name').value=''; }).catch(e=> alert(e.message));
}

function selectChannel(channelId){
  // cleanup previous channel listeners
  if(channelMessagesRef && channelMessagesListener) channelMessagesRef.off('value', channelMessagesListener);
  if(typingRef && currentChannel) typingRef.child(currentChannel.id).child(me.uid).remove().catch(()=>{});
  currentChannel = classChannels.find(c=>c.id===channelId);
  renderChannelsList();
  if(!currentChannel){
    $('channel-title').textContent = 'Select a channel';
    $('channel-input').disabled = true;
    $('channel-send').disabled = true;
    $('channel-messages').innerHTML = '';
    return;
  }
  $('channel-title').textContent = '# ' + currentChannel.name;
  $('channel-input').disabled = false; $('channel-send').disabled = false;
  channelMessagesRef = db.ref(`classes/${currentClass.id}/chatChannels/${currentChannel.id}/messages`);
  channelMessagesListener = channelMessagesRef.orderByChild('timestamp').limitToLast(300).on('value', snap=>{
    const val = snap.val() || {};
    const arr = Object.values(val).sort((a,b)=>a.timestamp - b.timestamp);
    renderChannelMessages(arr);
  });
  typingRef = db.ref(`typing/${currentClass.id}/${currentChannel.id}`);
  typingRef.on('value', s=>{
    const t = s.val() || {};
    const typingUsers = Object.keys(t).filter(uid => t[uid] && uid !== me.uid);
    $('channel-typing').textContent = typingUsers.length ? `${typingUsers.length} typing...` : '';
  });
}

function renderChannelMessages(list){
  const area = $('channel-messages');
  if(!area) return;
  area.innerHTML = '';
  if(list.length === 0){ area.innerHTML = '<div class="small muted" style="text-align:center">No messages yet</div>'; return; }
  list.forEach(m=>{
    const el = document.createElement('div');
    el.className = 'msg' + (m.senderId === me.uid ? ' me' : '');
    const avatar = document.createElement('div');
    avatar.style.minWidth='44px';
    avatar.style.textAlign='center';
    avatar.innerHTML = `<div style="width:36px;height:36px;border-radius:8px;background:#eef2ff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:var(--indigo)">${escapeHtml((m.senderName||'U').charAt(0).toUpperCase())}</div>`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (m.senderId === me.uid ? ' me' : '');
    bubble.innerHTML = `<div style="font-size:13px;font-weight:700">${escapeHtml(m.senderName||'Unknown')}</div><div style="margin-top:6px">${escapeHtml(m.text)}</div><div class="small muted" style="margin-top:6px">${new Date(m.timestamp).toLocaleString()}</div>`;
    // add delete button if this user owns the message
    const actions = document.createElement('div');
    actions.style.marginTop = '6px';
    if(m.senderId === me.uid){
      const delBtn = document.createElement('button');
      delBtn.className = 'inline-btn';
      delBtn.textContent = 'Delete';
      delBtn.onclick = ()=> {
        if(!confirm('Delete your message?')) return;
        db.ref(`classes/${currentClass.id}/chatChannels/${currentChannel.id}/messages/${m.id}`).remove().catch(e=> alert(e.message));
      };
      actions.appendChild(delBtn);
    }
    bubble.appendChild(actions);
    el.appendChild(avatar);
    el.appendChild(bubble);
    area.appendChild(el);
  });
  area.scrollTop = area.scrollHeight;
}

function sendChannelMessage(){
  const text = $('channel-input').value.trim();
  if(!text || !currentChannel) return;
  const id = Date.now().toString() + '-' + Math.random().toString(36).slice(2,5);
  const payload = { id, text, senderName: me.displayName || me.email.split('@')[0], senderId: me.uid, timestamp: Date.now() };
  db.ref(`classes/${currentClass.id}/chatChannels/${currentChannel.id}/messages/${id}`).set(payload).then(()=> {
    $('channel-input').value='';
    setChannelTyping(false);
  }).catch(e=> alert(e.message));
}

$('channel-input')?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendChannelMessage(); }
  setChannelTyping(true);
  if(window._chanTypingTimeout) clearTimeout(window._chanTypingTimeout);
  window._chanTypingTimeout = setTimeout(()=> setChannelTyping(false), 1200);
});

function setChannelTyping(state){
  if(!currentChannel || !currentClass) return;
  const ref = db.ref(`typing/${currentClass.id}/${currentChannel.id}/${me.uid}`);
  if(state) ref.set(true); else ref.remove().catch(()=>{});
}

/* ---------------- Groups & mini-chat ---------------- */
function renderGroupsList(){
  const container = $('groups-list');
  if(!container) return;
  container.innerHTML = '';
  if(groups.length === 0){ container.innerHTML = '<div class="small muted">No groups yet</div>'; return; }
  groups.forEach(g=>{
    const el = document.createElement('div');
    el.className = 'card';
    const membersList = g.members ? Object.keys(g.members).join(', ') : '';
    const isMember = g.members && g.members[me.uid];
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700">${escapeHtml(g.name)}</div>
        <div class="small">Created by: ${escapeHtml(g.creatorName || 'Unknown')} • ${escapeHtml(g.time || '')}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        ${isMember ? `<button class="inline-btn" onclick="openGroupChat('${escapeHtml(g.id)}')">Open Chat</button>` : `<button class="inline-btn" onclick="joinGroup('${escapeHtml(g.id)}')">Join</button>`}
        ${g.creatorId === me.uid ? `<button class="inline-btn" onclick="deleteGroup('${escapeHtml(g.id)}')">Delete</button>` : ''}
      </div>
    </div>`;
    container.appendChild(el);
  });
}

function createGroup(){
  const name = $('group-name').value.trim();
  const time = $('group-time').value.trim();
  if(!name) return alert('Enter group name');
  const id = Date.now().toString();
  const payload = { id, name, time, creatorId: me.uid, creatorName: me.displayName || me.email.split('@')[0], createdAt: Date.now(), members: { [me.uid]: true } };
  db.ref(`classes/${currentClass.id}/groups/${id}`).set(payload).then(()=> {
    $('group-name').value=''; $('group-time').value='';
  }).catch(e=> alert(e.message));
}

function deleteGroup(id){
  if(!confirm('Delete this group?')) return;
  db.ref(`classes/${currentClass.id}/groups/${id}`).once('value').then(snap=>{
    const g = snap.val();
    if(!g) return alert('Group not found');
    if(g.creatorId !== me.uid) return alert('Only the group creator can delete the group');
    db.ref(`classes/${currentClass.id}/groups/${id}`).remove().catch(e=> alert(e.message));
  });
}

function joinGroup(id){
  db.ref(`classes/${currentClass.id}/groups/${id}/members/${me.uid}`).set(true).catch(e=> alert(e.message));
}

function openGroupChat(groupId){
  // ensure user is member
  db.ref(`classes/${currentClass.id}/groups/${groupId}`).once('value').then(snap=>{
    const g = snap.val();
    if(!g) return alert('Group not found');
    if(!g.members || !g.members[me.uid]) return alert('You must join the group to open chat');
    currentGroupId = groupId;
    document.getElementById('group-chat-area').style.display = 'block';
    document.getElementById('group-chat-title').textContent = `${g.name} • ${g.time || ''}`;
    // cleanup old
    if(groupMessagesRef && groupMessagesListener) groupMessagesRef.off('value', groupMessagesListener);
    groupMessagesRef = db.ref(`classes/${currentClass.id}/groups/${groupId}/chat`);
    groupMessagesListener = groupMessagesRef.orderByChild('timestamp').limitToLast(300).on('value', snap=>{
      const val = snap.val() || {};
      const arr = Object.values(val).sort((a,b)=>a.timestamp - b.timestamp);
      renderGroupMessages(arr);
    });
    // typing for group
    const groupTypingRef = db.ref(`typing/${currentClass.id}/groups/${groupId}`);
    groupTypingRef.on('value', s=>{
      const t = s.val() || {};
      const typingUsers = Object.keys(t).filter(uid => t[uid] && uid !== me.uid);
      $('group-typing').textContent = typingUsers.length ? `${typingUsers.length} typing...` : '';
    });
  }).catch(e=> alert(e.message));
}

function renderGroupMessages(arr){
  const area = $('group-chat-messages');
  if(!area) return;
  area.innerHTML = '';
  if(arr.length === 0){ area.innerHTML = '<div class="small muted" style="text-align:center">No messages yet</div>'; return; }
  arr.forEach(m=>{
    const el = document.createElement('div');
    el.className = 'msg' + (m.senderId === me.uid ? ' me' : '');
    const avatar = document.createElement('div');
    avatar.style.minWidth='44px';
    avatar.style.textAlign='center';
    avatar.innerHTML = `<div style="width:36px;height:36px;border-radius:8px;background:#eef2ff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:var(--indigo)">${escapeHtml((m.senderName||'U').charAt(0).toUpperCase())}</div>`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (m.senderId === me.uid ? ' me' : '');
    bubble.innerHTML = `<div style="font-size:13px;font-weight:700">${escapeHtml(m.senderName||'Unknown')}</div><div style="margin-top:6px">${escapeHtml(m.text)}</div><div class="small muted" style="margin-top:6px">${new Date(m.timestamp).toLocaleString()}</div>`;
    if(m.senderId === me.uid){
      const del = document.createElement('button');
      del.className = 'inline-btn';
      del.textContent = 'Delete';
      del.onclick = ()=> {
        if(!confirm('Delete your message?')) return;
        db.ref(`classes/${currentClass.id}/groups/${currentGroupId}/chat/${m.id}`).remove().catch(e=> alert(e.message));
      };
      bubble.appendChild(del);
    }
    el.appendChild(avatar);
    el.appendChild(bubble);
    area.appendChild(el);
  });
  area.scrollTop = area.scrollHeight;
}

function sendGroupMessage(){
  const input = $('group-chat-input');
  if(!currentGroupId || !input) return;
  const text = input.value.trim();
  if(!text) return;
  const id = Date.now().toString() + '-' + Math.random().toString(36).slice(2,5);
  const payload = { id, text, senderName: me.displayName || me.email.split('@')[0], senderId: me.uid, timestamp: Date.now() };
  db.ref(`classes/${currentClass.id}/groups/${currentGroupId}/chat/${id}`).set(payload).then(()=> {
    input.value='';
    db.ref(`typing/${currentClass.id}/groups/${currentGroupId}/${me.uid}`).remove().catch(()=>{});
  }).catch(e=> alert(e.message));
}

$('group-chat-input')?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendGroupMessage(); }
  if(!currentGroupId) return;
  const ref = db.ref(`typing/${currentClass.id}/groups/${currentGroupId}/${me.uid}`);
  ref.set(true);
  if(window._groupTypingTimeout) clearTimeout(window._groupTypingTimeout);
  window._groupTypingTimeout = setTimeout(()=> ref.remove().catch(()=>{}), 1200);
});

$('close-group-chat')?.addEventListener('click', ()=>{
  if(groupMessagesRef && groupMessagesListener) groupMessagesRef.off('value', groupMessagesListener);
  document.getElementById('group-chat-area').style.display = 'none';
  document.getElementById('group-chat-messages').innerHTML = '';
  currentGroupId = null;
});

/* ---------------- Presence ---------------- */
function setupPresence(classId){
  // cleanup previous
  if(presenceListener && presenceRef) presenceRef.off('value', presenceListener);
  presenceRef = db.ref(`presence/${classId}`);
  const meRef = db.ref(`presence/${classId}/${me.uid}`);
  meRef.set({ name: me.displayName || me.email.split('@')[0], online: true, lastSeen: Date.now() });
  meRef.onDisconnect().set({ name: me.displayName || me.email.split('@')[0], online:false, lastSeen: Date.now() });
  presenceListener = presenceRef.on('value', snap=>{
    const val = snap.val() || {};
    const onlineNames = Object.values(val).filter(p=>p && p.online).map(p=>p.name);
    const el = document.getElementById('class-presence');
    if(el) el.textContent = onlineNames.length ? `Online: ${onlineNames.join(', ')}` : 'No one online';
    const channelOnline = document.getElementById('channel-online');
    if(channelOnline) channelOnline.textContent = `Online: ${onlineNames.length}`;
    const homePres = document.getElementById('home-presence');
    if(homePres) homePres.textContent = onlineNames.length ? `Online: ${onlineNames.join(', ')}` : 'No one online';
  });
}

/* ---------------- Cleanup listeners ---------------- */
function cleanupClassListeners(){
  // remove typing for current channel
  if(typingRef && currentChannel) typingRef.child(currentChannel.id).child(me.uid).remove().catch(()=>{});
  if(channelMessagesRef && channelMessagesListener) channelMessagesRef.off('value', channelMessagesListener);
  if(typingRef) typingRef.off();
  if(presenceRef && presenceListener) presenceRef.off('value', presenceListener);
  if(groupMessagesRef && groupMessagesListener) groupMessagesRef.off('value', groupMessagesListener);
  // reset vars
  currentChannel = null; channelMessagesRef = null; channelMessagesListener = null;
  typingRef = null; presenceRef = null; presenceListener = null;
  currentGroupId = null; groupMessagesRef = null; groupMessagesListener = null;
}

function cleanupAllListeners(){
  cleanupClassListeners();
  // stop user classes listener
  if(me) db.ref(`users/${me.uid}/classesJoined`).off();
}

/* ---------------- Attach class view handlers ---------------- */
function attachClassViewHandlers(){
  // tabs
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.onclick = ()=> {
      document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const tab = b.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c=> c.style.display='none');
      const node = document.getElementById('tab-' + tab);
      if(node) node.style.display = 'block';
    };
  });
  // back, invite, leave, logout
  $('back-classes').onclick = ()=> { cleanupClassListeners(); currentClass = null; render(); };
  $('invite-btn').onclick = ()=> alert('Invite code: ' + (currentClass.inviteCode || '—'));
  $('leave-class').onclick = ()=> leaveClass();
  $('logout2').onclick = ()=> { cleanupAllListeners(); auth.signOut().catch(()=>{}); };

  // deadlines
  $('add-deadline').onclick = addDeadline;

  // posts
  $('add-post').onclick = addPost;

  // channels
  $('create-channel').onclick = createChannel;
  $('channel-send').onclick = sendChannelMessage;
  // listen typing and enter for channel input
  $('channel-input')?.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChannelMessage(); }
    if(!currentChannel) return;
    const ref = db.ref(`typing/${currentClass.id}/${currentChannel.id}/${me.uid}`);
    ref.set(true);
    if(window._typingTimeout) clearTimeout(window._typingTimeout);
    window._typingTimeout = setTimeout(()=> ref.remove().catch(()=>{}), 1200);
  });

  // groups
  $('create-group').onclick = createGroup;
  $('group-chat-send').onclick = sendGroupMessage;
}

/* ---------------- Initial auth state ---------------- */
auth.onAuthStateChanged(user=>{
  if(user){
    me = user;
    // create profile entry (non-sensitive fields) for future use
    db.ref(`users/${me.uid}/profile`).update({ name: me.displayName || '', email: me.email }).catch(()=>{});
    loadUserClassesRealtime();
    render();
  } else {
    // cleanup
    cleanupAllListeners();
    me = null;
    myClasses = [];
    currentClass = null;
    render();
  }
});

/* attempt to populate UI after a short delay if already logged in */
setTimeout(()=> { if(auth.currentUser){ me = auth.currentUser; loadUserClassesRealtime(); render(); } else render(); }, 300);

