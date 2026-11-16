import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { until } from './browser.mjs';
export async function visualChecks(b,root,delivery='delivery-6'){
  const directory=path.join(root,'docs/evidence',delivery);mkdirSync(directory,{recursive:true});
  const captures=[];const contrast=[];
  async function expandFirst(){
    await until(()=>b.evaluate('!!document.querySelector('+JSON.stringify('[data-video="1"] [data-details]')+')'),'video summary');
    if(!await b.evaluate('!!document.querySelector("z-dialog-panel")'))await b.click('[data-video="1"] [data-details]');
    await until(()=>b.evaluate('!!document.querySelector("z-dialog-panel")'),'video dialog');
  }
  async function closeVideo(){if(await b.evaluate('!!document.querySelector("[data-close-video]")'))await b.click('[data-close-video]');await until(()=>b.evaluate('!document.querySelector("z-dialog-panel")'),'dialog closed');}
  async function screenshot(name,top=true){if(top)await b.evaluate('window.scrollTo(0,0)');await b.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(directory,name+'.png'),Buffer.from(shot.data,'base64'));captures.push(name+'.png');}
  async function viewport(width,height=960){await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}
  async function noOverflow(name){assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),name+' horizontal overflow');}
  await viewport(1280);
  await b.click('nav a[href="/library"]');await expandFirst();await b.waitText('Prepare your CV.');
  for(const mode of ['light','dark']){
    await b.send('Page.navigate',{url:await b.evaluate('location.origin+"/library?video=1"')});await b.waitText('Mostrando el vídeo seleccionado.');await expandFirst();await b.waitText('Prepare your CV.');await until(()=>b.evaluate('document.querySelectorAll("[data-video]").length===1'),'selected video rendered');
    await b.fill('#theme',mode);
    await until(()=>b.evaluate(`getComputedStyle(document.documentElement).colorScheme===${JSON.stringify(mode)}`),'theme applied');
    await closeVideo();await screenshot('library-compact-desktop-'+mode);await expandFirst();await screenshot('library-desktop-'+mode);await noOverflow('desktop '+mode);
    const fixedTop=await b.evaluate('document.querySelector(".library-top").getBoundingClientRect().top');
    await b.evaluate('document.querySelector(".video-dialog-body").scrollTop=300');
    assert.equal(await b.evaluate('document.querySelector(".library-top").getBoundingClientRect().top'),fixedTop);
    assert.ok(await b.evaluate('document.querySelector(".video-dialog-body").scrollTop>0'));await closeVideo();
    assert.ok(await b.evaluate('document.documentElement.scrollHeight<=innerHeight+1'),'no outer document scroll');
    await b.evaluate('document.querySelector(".library-results").scrollTop=0');
    const pairs=await b.evaluate(`(()=>{
      const vars=['--ink','--sub','--accent','--error','--warning','--accepted','--line'];
      const sample=document.createElement('span');document.body.append(sample);
      function color(value){sample.style.color=value;return getComputedStyle(sample).color;}
      const result={};for(const v of [...vars,'--paper','--soft'])result[v]=color('var('+v+')');sample.remove();return result;
    })()`);
    const buttons=await b.evaluate(`(()=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
      function rgb(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const [r,g,b,a]=ctx.getImageData(0,0,1,1).data;return a===255?'rgb('+[r,g,b].join(',')+')':'rgba('+[r,g,b,a/255].join(',')+')';}
      return [...document.querySelectorAll('button')].filter(e=>!e.disabled&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({text:e.textContent,color:rgb(getComputedStyle(e).color),background:rgb(getComputedStyle(e).backgroundColor)}));
    })()`);
    function rgb(text){const parts=text.match(/[\d.]+/g).map(Number);return parts.slice(0,3).map(n=>n/255);}
    function lum(color){return rgb(color).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);}
    for(const button of buttons){if(button.background.includes('rgba'))continue;const a=lum(button.color),c=lum(button.background),ratio=(Math.max(a,c)+.05)/(Math.min(a,c)+.05);assert.ok(ratio>=4.5,`${mode} button ${button.text}: ${ratio}`);contrast.push({mode,foreground:'button text',background:'button fill',ratio:Number(ratio.toFixed(2))});}
    for(const foreground of ['--ink','--sub','--accent','--error','--warning','--accepted'])for(const background of ['--paper','--soft']){
      const a=lum(pairs[foreground]),c=lum(pairs[background]),ratio=(Math.max(a,c)+.05)/(Math.min(a,c)+.05);
      assert.ok(ratio>=4.5,`${mode} ${foreground} on ${background}: ${ratio}`);contrast.push({mode,foreground,background,ratio:Number(ratio.toFixed(2))});
    }
    for(const background of ['--paper','--soft']){const a=lum(pairs['--line']),c=lum(pairs[background]),ratio=(Math.max(a,c)+.05)/(Math.min(a,c)+.05);assert.ok(ratio>=3,`${mode} control border: ${ratio}`);contrast.push({mode,foreground:'--line',background,ratio:Number(ratio.toFixed(2))});}
    await viewport(320,1000);await noOverflow('320 '+mode);await b.evaluate('window.scrollTo(0,0)');assert.ok(await b.evaluate('!document.querySelector(".activity") || document.querySelector(".activity").getBoundingClientRect().top<innerHeight'),'contextual activity stays visible when present on mobile');await closeVideo();await screenshot('library-compact-mobile-'+mode);await expandFirst();await screenshot('library-mobile-'+mode);assert.ok(await b.evaluate('document.querySelector("z-dialog-panel").getBoundingClientRect().width<=innerWidth'),'dialog fits mobile');await closeVideo();
    assert.ok(await b.evaluate('document.querySelector(".library-results").clientHeight>200'),'usable mobile list height');
    assert.ok(await b.evaluate('document.documentElement.scrollHeight<=innerHeight+1'),'mobile has no outer page scroll');
    await b.click('.filter-toggle');assert.ok(await b.evaluate('document.querySelector("#library-filters").getBoundingClientRect().height>0'));
    await b.evaluate('document.querySelector("#filter-submit").focus()');
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await until(()=>b.evaluate('document.activeElement.classList.contains("filter-toggle")'),'mobile filter submission restores focus to the toggle');
    await b.evaluate('document.querySelector("[data-video]").scrollIntoView({block:"start"})');await screenshot('library-mobile-result-'+mode,false);await noOverflow('long result title 320 '+mode);
    await b.click('nav a[href="/processing"]');await b.waitText('Procesado');await noOverflow('processing 320 '+mode);await screenshot('processing-mobile-'+mode);
    const processingTop=await b.evaluate('document.querySelector(".processing-top").getBoundingClientRect().top');
    await b.click('[data-finished-toggle]');await until(()=>b.evaluate('document.querySelector("[data-finished-toggle]").getAttribute("aria-expanded")==="true"'),'finished rows expanded');
    await b.click('.queue-summary');
    await b.evaluate('document.querySelector(".processing-results").scrollTop=300');
    assert.ok(await b.evaluate('document.querySelector(".processing-results").scrollTop>0'),'only processing list scrolls');
    assert.equal(await b.evaluate('document.querySelector(".processing-top").getBoundingClientRect().top'),processingTop,'processing controls stay fixed');
    await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:160,y:200,deltaX:0,deltaY:240});
    await b.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(await b.evaluate('window.scrollY'),0,'wheel outside the list cannot scroll the document');
    assert.equal(await b.evaluate('getComputedStyle(document.documentElement).overflowY'),'clip','processing disables the outer scrollbar');
    assert.equal(await b.evaluate('document.querySelector(".processing-top").getBoundingClientRect().top'),processingTop);
    await b.evaluate('document.querySelector(".processing-results").scrollTop=0;document.querySelector(".processing-results").focus()');
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'PageDown',code:'PageDown',windowsVirtualKeyCode:34});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'PageDown',code:'PageDown',windowsVirtualKeyCode:34});
    await until(()=>b.evaluate('document.querySelector(".processing-results").scrollTop>0'),'keyboard scrolls processing list');
    assert.equal(await b.evaluate('window.scrollY'),0);
    await b.evaluate('document.querySelector(".processing-results").scrollTop=0');await b.click('.queue-summary');await b.click('[data-finished-toggle]');
    await viewport(1280);await noOverflow('processing desktop '+mode);await screenshot('processing-desktop-'+mode);await viewport(320,1000);
    await viewport(640,480);assert.ok(await b.evaluate('document.querySelector(".processing-results").clientHeight>80'),'processing list remains usable in a short viewport');await screenshot('processing-reflow-'+mode);await viewport(320,1000);
    await b.click('nav a[href="/add"]');await b.waitText('De guardado a útil.');await noOverflow('add 320 '+mode);await screenshot('add-mobile-'+mode);
    await viewport(1280);await b.click('nav a[href="/library"]');await expandFirst();await b.waitText('Prepare your CV.');
  }
  // A 640x480 CSS viewport exercises reflow at the space available after 200% desktop zoom.
  // CSS zoom alone does not update media queries or viewport units and cannot represent browser zoom.
  await closeVideo();await viewport(640,480);await screenshot('library-reflow-640');await noOverflow('640x480 reflow');
  assert.ok(await b.evaluate('document.querySelector(".library-results").clientHeight>90'),'results remain reachable in a short viewport');
  await viewport(1280);
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('button')).transitionDuration"),'0s');
  await b.click('nav a[href="/add"]');await b.waitText('De guardado a útil.');
  // A native keyboard submission reaches the actual backend, without a click helper.
  await b.fill('#url','https://youtu.be/KEYBOARD123');await b.evaluate("document.querySelector('#url').focus()");
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await b.waitText('Vídeo añadido');
  assert.ok(await b.evaluate("document.activeElement.id==='url'"),'submission retains input focus');
  // The skip link is reached by an actual Tab from a reset document focus.
  await b.evaluate('document.activeElement.blur();document.body.tabIndex=-1;document.body.focus()');
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await b.evaluate('document.activeElement.className'),'skip-link');
  const focus=await b.evaluate('getComputedStyle(document.activeElement).outlineWidth');assert.equal(focus,'3px');
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>b.evaluate('document.activeElement.id==="content"'),'skip link moves focus to content');
  await screenshot('add-desktop-dark');
  await b.fill('#language','en');await b.click('nav a[href="/library"]');await b.waitText('Library');await expandFirst();await b.waitText('Prepare your CV.');
  await b.send('Page.navigate',{url:await b.evaluate('location.origin+"/library?video=1"')});await b.waitText('Showing the selected video.');await expandFirst();await b.waitText('Prepare your CV.');
  assert.equal(await b.evaluate('document.documentElement.lang'),'en');
  await b.send('Page.navigate',{url:await b.evaluate('location.origin+"/library"')});await until(()=>b.evaluate('document.querySelectorAll("[data-details]").length>0'),'compact list rendered');await screenshot('library-desktop-en');await viewport(320,900);await screenshot('library-mobile-en');await noOverflow('English mobile');
  const report={verified_at:new Date().toISOString(),captures,contrast,min_text_contrast:Math.min(...contrast.filter(x=>x.foreground!=='--line').map(x=>x.ratio)),min_control_contrast:Math.min(...contrast.filter(x=>x.foreground==='--line').map(x=>x.ratio)),viewports:[1280,320,640],layout_zoom:'640x480 reflow; browser toolbar zoom not automated',reduced_motion:true,keyboard:{enter_submits:true,skip_link:true,visible_focus:true}};
  writeFileSync(path.join(root,`docs/${delivery}-visual.json`),JSON.stringify(report,null,2)+'\n');return report;
}
