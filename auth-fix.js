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
