// Prevent a SIGNED_OUT auth event from recursively calling auth.signOut again.
window.signOut = async function signOutUiOnly(){
  state.user=null;
  state.profile=null;
  state.league=null;
  state.members=[];
  state.leagueLineups=[];
  state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));
  state.submitted=false;
  state.liveStats={};
  document.getElementById('authScreen')?.classList.remove('hidden');
  document.getElementById('appShell')?.classList.add('auth-locked');
  renderAll();
};

async function applyLeagueAdminUi(){
  if(!state.user)return;
  const {data,error}=await sb.from('profiles').select('is_admin').eq('id',state.user.id).single();
  const isAdmin=!error&&data?.is_admin===true;
  if(state.profile)state.profile.is_admin=isAdmin;

  const createButton=document.getElementById('createLeagueBtn');
  const createCard=createButton?.closest('.panel');
  if(createCard)createCard.classList.toggle('hidden',!isAdmin);

  const setupGrid=document.querySelector('#leagueSetup .league-card');
  if(setupGrid)setupGrid.style.gridTemplateColumns=isAdmin?'1fr 1fr':'1fr';
}

// Ensure the admin-only league creation controls are updated after every sign-in.
const originalOnSignedIn=onSignedIn;
onSignedIn=async function(user){
  await originalOnSignedIn(user);
  await applyLeagueAdminUi();
};

// Extra guard in the browser. Supabase RLS also blocks non-admin league creation server-side.
document.getElementById('createLeagueBtn')?.addEventListener('click',async(event)=>{
  if(state.profile?.is_admin===true)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showStatus('leagueStatus','Only the league administrator can create leagues.','danger');
},true);

sb.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_IN'&&session?.user)setTimeout(applyLeagueAdminUi,0);
});
