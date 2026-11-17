import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {until} from './browser.mjs';

// The current UI has a fixed light appearance, native language selector, a split
// processing view and a place drawer. Exercise those controls, not the retired tray/theme UI.
export async function visualChecks(b,root,delivery='journey'){
  const directory=path.join(root,'.cache',delivery,'visual');mkdirSync(directory,{recursive:true});
  const captures=[];
  const origin=await b.evaluate('location.origin');
  async function capture(name){
    await b.evaluate('document.fonts.ready');await b.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(directory,name+'.png'),Buffer.from(shot.data,'base64'));captures.push(name+'.png');
  }
  for(const width of [1280,640,375,320]){
    await b.send('Emulation.setDeviceMetricsOverride',{width,height:width===640?480:960,deviceScaleFactor:1,mobile:false});
    for(const [route,selector] of [['add','.add-page'],['processing','.processing-layout'],['results','.library-results'],['explore','.explore-page']]){
      await b.send('Page.navigate',{url:origin+'/#'+route});await until(()=>b.evaluate('!!document.querySelector('+JSON.stringify(selector)+')'),'current '+route);
      assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route+' overflow at '+width);
      assert.ok(await b.evaluate('document.querySelector("#language-select").getBoundingClientRect().right<=innerWidth'), 'language selector fits');
      if(route==='processing'){
        assert.ok(await b.evaluate('document.querySelector(".queue-scroll").clientHeight>50'),'queue remains usable');
        assert.ok(await b.evaluate('document.querySelector(".agent-trail").clientHeight>80'),'trace remains usable');
      }
      if(route==='results'){
        await until(()=>b.evaluate('!!document.querySelector("[data-details]")'),'library list');
        await b.click('[data-details]');await until(()=>b.evaluate('!!document.querySelector("z-dialog-panel")'),'result details');
        await until(()=>b.evaluate('document.querySelector("z-dialog-panel").getBoundingClientRect().right<=innerWidth+1'),'dialog fits');
        await capture(route+'-dialog-'+width);await b.click('[data-close-video]');await until(()=>b.evaluate('!document.querySelector("z-dialog-panel")'),'dialog closes');
        await until(()=>b.evaluate('document.activeElement.matches("[data-details]")'),'result focus restored');
      }
      await capture(route+'-'+width);
    }
  }
  await b.send('Page.navigate',{url:origin+'/#add'});await until(()=>b.evaluate('!!document.querySelector(".add-page")'),'add for keyboard');
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".page-enter")).animationName'),'none');
  await b.evaluate('document.activeElement.blur();document.body.tabIndex=-1;document.body.focus()');
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await b.evaluate('document.activeElement.className'),'skip-link');
  assert.ok(await b.evaluate('parseFloat(getComputedStyle(document.activeElement).outlineWidth)>0'),'visible keyboard focus');
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>b.evaluate('document.activeElement.id==="content"'),'skip to main content');
  await b.fill('#url','https://youtu.be/NEWTEST1234');
  const colors=await b.evaluate('(()=>{const e=document.querySelector("#add-submit"),s=getComputedStyle(e);return [s.color,s.backgroundColor]})()');
  const luminance=text=>text.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{const n=x/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const a=luminance(colors[0]),c=luminance(colors[1]),contrast=(Math.max(a,c)+.05)/(Math.min(a,c)+.05);assert.ok(contrast>=4.5,'primary button contrast');
  const report={captures,viewports:[1280,640,375,320],appearance:'light',reducedMotion:true,keyboard:{skipLink:true,visibleFocus:true,dialogFocusRestored:true},primaryButtonContrast:contrast};
  writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));return report;
}
