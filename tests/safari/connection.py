"""Native Safari + real Cloudflare relay; no WebSocket fallback or UA emulation."""
import json
import os
import time
from pathlib import Path
from selenium import webdriver

origin = "https://game.scene-hunter.workers.dev"
out = Path("test-results/safari")
out.mkdir(parents=True, exist_ok=True)
driver = webdriver.Safari()
driver.set_script_timeout(180)
room = None
try:
    driver.get(origin)
    room = driver.execute_async_script("""
      const done = arguments[arguments.length - 1];
      (async () => {
        const kp = await crypto.subtle.generateKey({name:'Ed25519'}, true, ['sign','verify']);
        const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
        const pubkey = btoa(String.fromCharCode(...raw)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
        const r = await fetch('/api/rooms', {method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:'Safari CI',pubkey,locale:'en'})});
        if (!r.ok) throw new Error('create room: '+r.status);
        return await r.json();
      })().then(done, e=>done({error:String(e)}));
    """)
    if room.get("error"):
        raise RuntimeError(room["error"])
    driver.get("http://localhost:5173")
    result = driver.execute_async_script("""
      const url = arguments[0], done = arguments[arguments.length - 1];
      (async () => {
        const {MoqSession, createMoqNetConnector} = await import('/src/client/moq/session.ts');
        const connector = createMoqNetConnector();
        if (connector.maxSessionAgeMs !== 60000) throw new Error('WebKit rotation not enabled');
        let connections = 0;
        const counted = {...connector, connect: async u => {const c=await connector.connect(u); connections++; return c;}};
        const a = new MoqSession(url, counted), b = new MoqSession(url, counted);
        let timer;
        try {
          await Promise.all([a.start(), b.start()]);
          const writer = a.publish('safari-ci', 'state');
          let received = 0, last = -1;
          b.subscribe('safari-ci', 'state', bytes => {last=Number(new TextDecoder().decode(bytes)); received++;});
          let sent=0;
          timer=setInterval(()=>writer.snapshot(new TextEncoder().encode(String(++sent))),1000);
          const samples=[];
          for (let i=0;i<13;i++) {
            await new Promise(r=>setTimeout(r,10000));
            if (last < sent-5) throw new Error('delivery stalled at '+i*10+'s');
            samples.push({seconds:(i+1)*10,received,last,connections});
          }
          if(connections<6) throw new Error('two rotations per peer not observed');
          return {userAgent:navigator.userAgent,samples};
        } finally {clearInterval(timer);a.close();b.close();}
      })().then(done,e=>done({error:String(e)}));
    """, room["moqUrl"])
    (out / "result.json").write_text(json.dumps(result, indent=2))
    if result.get("error"):
        raise RuntimeError(result["error"])
finally:
    driver.save_screenshot(str(out / "screen.png"))
    if room and room.get("roomToken"):
        driver.get(origin)
        driver.execute_async_script("""
          const done=arguments[arguments.length-1];
          fetch('/api/rooms/'+arguments[0]+'/close',{method:'POST',headers:{Authorization:'Bearer '+arguments[1]}})
            .then(r=>done(r.status),()=>done(0));
        """, room["code"], room["roomToken"])
    driver.quit()
