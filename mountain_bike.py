import sys
import math
import random
import os
import pygame

# Simple mountain bike platformer demo
# Controls: left/right arrows to accelerate/retrograde, up to jump, down to crouch/brake


WIDTH, HEIGHT = 1000, 600
FPS = 60


class Rider:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.vx = 0.0
        self.vy = 0.0
    self.angle = 0.0  # bike tilt in degrees
    self.on_ground = False
    self.width = 48
    self.height = 24
    # suspension / wheel state
    self.wheel_offset = 24
    self.wheel_radius = 14
    self.front_wheel_y = y + 12
    self.rear_wheel_y = y + 12
    self.front_wheel_vy = 0.0
    self.rear_wheel_vy = 0.0
    # physics params
    self.spring_k = 8000.0
    self.damper_c = 800.0
    self.mass = 70.0

    def update(self, dt, terrain, keys):
        # horizontal control
        accel = 1400.0
        if keys[pygame.K_RIGHT]:
            self.vx += accel * dt
        if keys[pygame.K_LEFT]:
            self.vx -= accel * dt

        # airborne tilt controls (A/D or left/right)
        if not self.on_ground:
            if keys[pygame.K_a] or keys[pygame.K_LEFT]:
                self.angle -= 120.0 * dt
            if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
                self.angle += 120.0 * dt

        # friction
        self.vx *= 0.996

        # gravity applied to rider body
        self.vy += 2600.0 * dt

        # jump
        if (keys[pygame.K_UP] or keys[pygame.K_SPACE]) and self.on_ground:
            self.vy = -950.0
            self.on_ground = False
            self._played_jump = False

        # integrate body
        self.x += self.vx * dt
        self.y += self.vy * dt

        # wheel positions based on body
        front_x = self.x + self.wheel_offset
        rear_x = self.x - self.wheel_offset

        # front wheel dynamics
        front_ground = terrain.get_ground_y(front_x)
        desired_front_y = front_ground - self.wheel_radius
        # spring based on wheel relative to body
        f_compression = (self.y + 12) - desired_front_y
        f_spring = -self.spring_k * (f_compression - 12)
        f_damper = -self.damper_c * self.front_wheel_vy
        f_total = (f_spring + f_damper) / self.mass
        self.front_wheel_vy += f_total * dt
        self.front_wheel_y += self.front_wheel_vy * dt

        # rear wheel dynamics
        rear_ground = terrain.get_ground_y(rear_x)
        desired_rear_y = rear_ground - self.wheel_radius
        r_compression = (self.y + 12) - desired_rear_y
        r_spring = -self.spring_k * (r_compression - 12)
        r_damper = -self.damper_c * self.rear_wheel_vy
        r_total = (r_spring + r_damper) / self.mass
        self.rear_wheel_vy += r_total * dt
        self.rear_wheel_y += self.rear_wheel_vy * dt

        # collision: wheels should not go below desired positions
        if self.front_wheel_y > desired_front_y:
            self.front_wheel_y = desired_front_y
            self.front_wheel_vy = 0
            # transfer impulse to body
            self.vy += -f_spring / 100.0 * dt

        if self.rear_wheel_y > desired_rear_y:
            self.rear_wheel_y = desired_rear_y
            self.rear_wheel_vy = 0
            self.vy += -r_spring / 100.0 * dt

        # determine if on ground (any wheel contacting)
        if self.front_wheel_y >= desired_front_y - 0.1 or self.rear_wheel_y >= desired_rear_y - 0.1:
            self.on_ground = True
        else:
            self.on_ground = False

        # keep angle within reasonable range
        self.angle = max(-75, min(75, self.angle))

        # limit horizontal speed
        self.vx = max(-1200, min(1600, self.vx))

    def draw(self, surf, cam_x):
        rx = int(self.x - cam_x)
        ry = int(self.y)
        # try to use external assets if available
        try:
            bike_img = pygame.image.load(os.path.join('assets', 'bike.png')).convert_alpha()
            rider_img = pygame.image.load(os.path.join('assets', 'rider.png')).convert_alpha()
            wheel_img = pygame.image.load(os.path.join('assets', 'wheel.png')).convert_alpha()
            bw = bike_img.get_width()
            bh = bike_img.get_height()
            # rotate images for tilt
            rot_bike = pygame.transform.rotozoom(bike_img, -self.angle, 1.0)
            rbw, rbh = rot_bike.get_size()
            surf.blit(rot_bike, (rx - rbw // 2, ry - rbh // 2))
            rot_rider = pygame.transform.rotozoom(rider_img, -self.angle, 1.0)
            surf.blit(rot_rider, (rx - rot_rider.get_width() // 2 + 8, ry - rbh // 2 - 18))
            # wheels: draw at wheel positions
            front_wx = int((self.x + self.wheel_offset) - cam_x)
            rear_wx = int((self.x - self.wheel_offset) - cam_x)
            fw_img = pygame.transform.rotozoom(wheel_img, 0, 1.0)
            surf.blit(fw_img, (front_wx - fw_img.get_width()//2, int(self.front_wheel_y) - fw_img.get_height()//2))
            surf.blit(fw_img, (rear_wx - fw_img.get_width()//2, int(self.rear_wheel_y) - fw_img.get_height()//2))
        except Exception:
            # fallback to simple shapes
            wheel_r = 12
            pygame.draw.circle(surf, (20, 20, 20), (rx - 18, int(self.rear_wheel_y) + 12 - int(self.y - ry)), wheel_r)
            pygame.draw.circle(surf, (20, 20, 20), (rx + 18, int(self.front_wheel_y) + 12 - int(self.y - ry)), wheel_r)
            pygame.draw.rect(surf, (200, 60, 40), pygame.Rect(rx - 20, ry - 8, 40, 12))
            pygame.draw.circle(surf, (50, 50, 200), (rx + 8, ry - 8), 8)


class Terrain:
    def __init__(self, seed=0):
        self.seed = seed
        self.points = []
        self.generate()

    def generate(self):
        random.seed(self.seed)
        self.points = []
        x = 0
        y = HEIGHT - 80
        self.points.append((x, y))
        while x < 10000:
            dx = random.randint(80, 220)
            dy = random.randint(-60, 60)
            x += dx
            y += dy
            y = max(150, min(HEIGHT - 40, y))
            self.points.append((x, y))

    def get_ground_y(self, px):
        # find segment
        if px <= self.points[0][0]:
            return self.points[0][1]
        for i in range(len(self.points) - 1):
            x1, y1 = self.points[i]
            x2, y2 = self.points[i+1]
            if x1 <= px <= x2:
                t = (px - x1) / (x2 - x1)
                return y1 + t * (y2 - y1)
        return self.points[-1][1]

    def draw(self, surf, cam_x):
        pts = []
        for x, y in self.points:
            pts.append((int(x - cam_x), int(y)))
        # close polygon
        pts2 = [(pts[0][0], HEIGHT), *pts, (pts[-1][0], HEIGHT)]
        pygame.draw.polygon(surf, (120, 200, 140), pts2)
        pygame.draw.lines(surf, (40, 120, 60), False, pts, 4)


def main():
    pygame.init()
    pygame.mixer.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    clock = pygame.time.Clock()
    font = pygame.font.SysFont(None, 24)

    # Ensure assets directory exists and contains simple PNGs.
    def create_assets_if_missing():
        assets_dir = os.path.join(os.getcwd(), 'assets')
        os.makedirs(assets_dir, exist_ok=True)

        bike_path = os.path.join(assets_dir, 'bike.png')
        rider_path = os.path.join(assets_dir, 'rider.png')
        wheel_path = os.path.join(assets_dir, 'wheel.png')
        bg_path = os.path.join(assets_dir, 'background.png')

        # create simple images only if they don't already exist
        if not os.path.exists(bike_path) or not os.path.exists(rider_path) or not os.path.exists(wheel_path):
            # bike
            bike_surf = pygame.Surface((96, 48), pygame.SRCALPHA)
            bike_surf.fill((0, 0, 0, 0))
            pygame.draw.rect(bike_surf, (180, 70, 30), pygame.Rect(8, 20, 64, 10))
            pygame.draw.circle(bike_surf, (20, 20, 20), (22, 36), 12)
            pygame.draw.circle(bike_surf, (20, 20, 20), (74, 36), 12)
            pygame.draw.line(bike_surf, (10, 10, 10), (22, 36), (40, 24), 4)
            pygame.draw.line(bike_surf, (10, 10, 10), (74, 36), (56, 24), 4)
            pygame.image.save(bike_surf, bike_path)

            # rider
            rider_surf = pygame.Surface((32, 32), pygame.SRCALPHA)
            rider_surf.fill((0, 0, 0, 0))
            pygame.draw.circle(rider_surf, (60, 60, 200), (18, 12), 8)
            pygame.draw.rect(rider_surf, (30, 120, 30), pygame.Rect(10, 18, 16, 10))
            pygame.image.save(rider_surf, rider_path)

            # wheel (for possible future use)
            wheel_surf = pygame.Surface((28, 28), pygame.SRCALPHA)
            wheel_surf.fill((0, 0, 0, 0))
            pygame.draw.circle(wheel_surf, (20, 20, 20), (14, 14), 12)
            pygame.draw.circle(wheel_surf, (120, 120, 120), (14, 14), 5)
            pygame.image.save(wheel_surf, wheel_path)

        # background
        if not os.path.exists(bg_path):
            bg = pygame.Surface((WIDTH, HEIGHT))
            for i in range(HEIGHT):
                r = int(135 + (200 - 135) * (i / HEIGHT))
                g = int(206 + (230 - 206) * (i / HEIGHT)) if i < HEIGHT else 206
                b = int(235 + (255 - 235) * (i / HEIGHT))
                pygame.draw.line(bg, (r, g, b), (0, i), (WIDTH, i))
            pygame.image.save(bg, bg_path)

        # simple sounds (generate sine beeps) if missing
        jump_snd = os.path.join(assets_dir, 'jump.wav')
        land_snd = os.path.join(assets_dir, 'land.wav')
        if not os.path.exists(jump_snd) or not os.path.exists(land_snd):
            try:
                import wave, struct, math
                def make_tone(path, freq, duration=0.12, volume=0.3):
                    frate = 44100
                    amp = int(32767 * volume)
                    nframes = int(duration * frate)
                    wav = wave.open(path, 'w')
                    wav.setparams((1, 2, frate, nframes, 'NONE', 'not compressed'))
                    for i in range(nframes):
                        val = int(amp * math.sin(2 * math.pi * freq * (i / frate)))
                        wav.writeframes(struct.pack('h', val))
                    wav.close()
                make_tone(jump_snd, 880, 0.12, 0.25)
                make_tone(land_snd, 440, 0.14, 0.35)
            except Exception:
                pass

    create_assets_if_missing()

    # level management
    level = 1
    max_levels = 3
    def make_level(n):
        t = Terrain(seed=42 + n * 13)
        # extend the map for longer runs
        # place finish line at the end
        finish_x = t.points[-1][0] - 120
        return t, finish_x

    terrain, finish_x = make_level(level)
    rider = Rider(200, terrain.get_ground_y(200) - 12)

    cam_x = 0
    score = 0
    start_time = pygame.time.get_ticks()
    finished = False
    show_menu = False

    # load sounds
    assets_dir = os.path.join(os.getcwd(), 'assets')
    try:
        jump_sound = pygame.mixer.Sound(os.path.join(assets_dir, 'jump.wav'))
    except Exception:
        jump_sound = None
    try:
        land_sound = pygame.mixer.Sound(os.path.join(assets_dir, 'land.wav'))
    except Exception:
        land_sound = None

    running = True
    while running:
        dt = clock.tick(FPS) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN and show_menu:
                if event.key == pygame.K_r:
                    # restart level
                    terrain, finish_x = make_level(level)
                    rider = Rider(200, terrain.get_ground_y(200) - 12)
                    cam_x = 0
                    score = 0
                    start_time = pygame.time.get_ticks()
                    show_menu = False
                if event.key == pygame.K_n and finished:
                    # next level
                    if level < max_levels:
                        level += 1
                        terrain, finish_x = make_level(level)
                        rider = Rider(200, terrain.get_ground_y(200) - 12)
                        cam_x = 0
                        score = 0
                        start_time = pygame.time.get_ticks()
                        finished = False
                        show_menu = False

        keys = pygame.key.get_pressed()

        prev_on_ground = rider.on_ground
        rider.update(dt, terrain, keys)

        # play jump/land sounds
        if not prev_on_ground and rider.on_ground and land_sound:
            land_sound.play()
        if prev_on_ground and not rider.on_ground and jump_sound:
            jump_sound.play()

        # camera follows rider smoothly
        cam_x += ((rider.x - cam_x) - 250) * 3.0 * dt

        screen.fill((135, 206, 235))

        # draw background if available
        try:
            bg = pygame.image.load(os.path.join(assets_dir, 'background.png')).convert()
            screen.blit(bg, (0, 0))
        except Exception:
            pass

        # draw terrain and rider
        terrain.draw(screen, cam_x)
        rider.draw(screen, cam_x)

        # finish line
        fx = int(finish_x - cam_x)
        pygame.draw.rect(screen, (220, 20, 60), (fx, 0, 6, HEIGHT))
        txt_finish = font.render('FINISH', True, (255, 255, 255))
        screen.blit(txt_finish, (fx - 12, 8))

        # update score (distance travelled)
        score = max(score, int(rider.x))

        # HUD
        info = f"Level {level}/{max_levels}  x={int(rider.x)}  score={score}"
        txt = font.render(info, True, (0, 0, 0))
        screen.blit(txt, (8, 8))

        # check finish
        if rider.x >= finish_x and not finished:
            finished = True
            show_menu = True

        if show_menu:
            # darken
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 160))
            screen.blit(overlay, (0, 0))
            title = 'Level Complete' if finished else 'Paused'
            t1 = font.render(title, True, (255, 255, 255))
            t2 = font.render('R = Restart', True, (255, 255, 255))
            t3 = font.render('N = Next Level' if level < max_levels else 'No more levels', True, (255, 255, 255))
            screen.blit(t1, (WIDTH//2 - 60, HEIGHT//2 - 20))
            screen.blit(t2, (WIDTH//2 - 60, HEIGHT//2 + 8))
            screen.blit(t3, (WIDTH//2 - 60, HEIGHT//2 + 36))

        pygame.display.flip()

    pygame.quit()


if __name__ == '__main__':
    main()
