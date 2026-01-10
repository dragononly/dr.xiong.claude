#!/usr/bin/env python3
import time
import os
import signal
import sys

class WDT:
    def __init__(self, device="/dev/watchdog0", interval=10):
        self.interval = interval
        self.fd = open(device, "w")
        signal.signal(signal.SIGTERM, self._stop)
    
    def feed(self):
        self.fd.write("1")
        self.fd.flush()
    
    def _stop(self, *args):
        self.fd.write("V")
        self.fd.close()
        sys.exit(0)
    
    def run(self, health_check=None, startup_delay=300, fail_timeout=600):
        """
        startup_delay: 开机后无条件喂狗时间（秒）
        fail_timeout: 持续异常多久后才重启（秒）
        """
        print(f"启动延迟 {startup_delay} 秒...")
        end_time = time.time() + startup_delay
        while time.time() < end_time:
            self.feed()
            time.sleep(self.interval)
        
        print("开始健康检测")
        fail_start = None
        
        while True:
            if health_check is None or health_check():
                self.feed()
                fail_start = None
            else:
                if fail_start is None:
                    fail_start = time.time()
                elapsed = time.time() - fail_start
                print(f"异常持续 {int(elapsed)}/{fail_timeout} 秒")
                if elapsed < fail_timeout:
                    self.feed()  # 未超时，继续喂狗
            
            time.sleep(self.interval)


def check_system_alive():
    with open("/proc/meminfo") as f:
        mem = dict(line.split()[:2] for line in f)
    avail = int(mem.get("MemAvailable:", "0"))
    if avail < 50000:
        print(f"内存不足: {avail}kB")
        return False
    
    try:
        start = time.time()
        with open("/tmp/.wdt_test", "w") as f:
            f.write("1")
        if time.time() - start > 5:
            print("磁盘IO卡死")
            return False
    except:
        print("磁盘写入失败")
        return False
    
    return True


if __name__ == "__main__":
    print("看门狗启动")
    wdt = WDT(interval=10)
    wdt.run(
        health_check=check_system_alive,
        startup_delay=300,  # 开机等5分钟
        fail_timeout=600    # 异常持续10分钟才重启
    )
