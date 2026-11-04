"""Three native Safari tabs play a real three-round game on the deployed service.
Only camera input is synthetic; MoQ, uploads, AI, scoring and UI are real.
"""
import json
import re
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

origin = "https://game.scene-hunter.workers.dev"
messages = json.loads(Path("messages/en.json").read_text())
out = Path("test-results/safari-game")
out.mkdir(parents=True, exist_ok=True)
driver = webdriver.Safari()
driver.command_executor._client_config.timeout = 240
driver.set_script_timeout(30)
wait = WebDriverWait(driver, 60)
stages = []
code = None
gm = None

def note(stage):
    stages.append({"stage": stage, "at": time.time()})
    (out / "stages.json").write_text(json.dumps(stages, indent=2))
    print(stage, flush=True)

def click(key):
    label = messages[key]
    def button(_):
        for b in driver.find_elements(By.TAG_NAME, "button"):
            if b.text.strip() == label and b.is_displayed() and b.is_enabled():
                return b
        return False
    wait.until(button).click()

def text(value):
    wait.until(lambda _: value in driver.find_element(By.TAG_NAME, "body").text)

def camera():
    driver.execute_script("""
      // Keep the browser's video/canvas/JPEG pipeline, replace physical camera input only.
      const canvas=document.createElement('canvas'); canvas.width=640;canvas.height=480;
      const ctx=canvas.getContext('2d');
      setInterval(()=>{ctx.fillStyle='#00a040';ctx.fillRect(0,0,640,480);ctx.fillStyle='#fff';ctx.fillText(String(Date.now()),20,30);},100);
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>canvas.captureStream(10), configurable:true});
      window.__safariCamera=canvas;
    """)

try:
    driver.get(origin)
    driver.execute_script("localStorage.setItem('sh:locale','en')")
    driver.refresh()
    note("Safari " + driver.capabilities.get("browserVersion", "unknown"))
    gm = driver.current_window_handle
    click("create_button")
    wait.until(lambda _: driver.find_elements(By.CSS_SELECTOR, "input[placeholder]"))[0].send_keys("Safari GM")
    click("create_button")
    text(messages["you_are_gm"])
    code = re.search(r"/r/(\d{6})", driver.current_url).group(1)
    camera()
    note("room-created")
    players = []
    for name in ["Safari Alice", "Safari Bob"]:
        driver.switch_to.new_window("tab")
        players.append(driver.current_window_handle)
        driver.get(origin + "/r/" + code)
        wait.until(lambda _: driver.find_elements(By.CSS_SELECTOR, "input[placeholder]"))[0].send_keys(name)
        click("join_button")
        text(messages["waiting_for_gm"])
        camera()
        note(name + "-joined")
    driver.switch_to.window(gm)
    wait.until(lambda _: len(driver.find_elements(By.CSS_SELECTOR, ".sh-tile")) == 3)
    click("start_button")
    for round_number in range(1, 4):
        driver.switch_to.window(gm)
        click("shoot_here")
        click("use_topic_photo")
        # Keep the authoritative GM tab active while real AI generates the hints.
        WebDriverWait(driver, 150).until(lambda _: messages["photo_taking"] in driver.find_element(By.TAG_NAME,"body").text)
        note(f"round-{round_number}-topic")
        for handle in players:
            driver.switch_to.window(handle)
            click("shutter_button")
            click("submit_photo")
            wait.until(lambda _: not any(b.text.strip()==messages["submit_photo"] for b in driver.find_elements(By.TAG_NAME,"button")))
        driver.switch_to.window(gm)
        photos = wait.until(lambda _: (p if len(p:=driver.find_elements(By.CSS_SELECTOR,'button[aria-pressed]'))==2 and all(b.is_enabled() for b in p) else False))
        for photo in photos:
            photo.click()
        click("pick_confirm")
        for handle in [gm, *players]:
            driver.switch_to.window(handle)
            text(messages["round_result_title"].replace("{round}",str(round_number)))
        driver.switch_to.window(gm)
        click("see_final_button" if round_number==3 else "next_round_button")
        note(f"round-{round_number}-complete")
    for handle in [gm, *players]:
        driver.switch_to.window(handle)
        text(messages["final_title"])
    note("all-three-saw-final-results")
finally:
    for i, handle in enumerate(driver.window_handles):
        driver.switch_to.window(handle)
        driver.save_screenshot(str(out / f"tab-{i}.png"))
        (out / f"tab-{i}.txt").write_text(driver.find_element(By.TAG_NAME,"body").text)
    if gm and code:
        driver.switch_to.window(gm)
        driver.execute_async_script("""
          const done=arguments[arguments.length-1],code=arguments[0];
          const me=JSON.parse(sessionStorage.getItem('sh:me:'+code));
          if(!me) return done(0);
          fetch('/api/rooms/'+code+'/close',{method:'POST',headers:{Authorization:'Bearer '+me.roomToken}}).then(r=>done(r.status),()=>done(0));
        """,code)
    driver.quit()
