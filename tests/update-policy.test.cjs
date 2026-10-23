const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
for(const app of ['싹싹김치 플레이어']){
 test(app+' refuses unsigned config and handles rejected network checks',async()=>{
  const {startUpdates}=require(path.join(root,app,'electron/update-policy.js'));
  let checks=0;const updater={on(){},checkForUpdatesAndNotify(){checks++;return Promise.reject(new Error('offline'));}};
  const base={app:{isPackaged:true,once(){}},updater,platform:'win32',repo:'test',log(){},schedule:()=>({unref(){}})};
  for(const text of ['', 'publisherName: null','publisherName: ""','publisherName: []','publisherName: TODO','publisherName: ["any"]']){
   assert.equal(await startUpdates({...base,readConfig:()=>text}),false);
  }
  assert.equal(checks,0);
  const config='provider: github\nowner: gyqls051-arch\nrepo: test\npublisherName:\n  - Trusted Company\n';
  assert.equal(await startUpdates({...base,readConfig:()=>config}),true);
  assert.equal(checks,1);assert.equal(updater.autoDownload,true);assert.equal(updater.allowDowngrade,false);
  assert.equal(await startUpdates({...base,readConfig:()=>config.replace('gyqls051-arch','other')}),false);
 });
}
