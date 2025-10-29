#!/usr/bin/env python3
"""Simple basketball demo using Pygame.

Controls:
- Left/Right arrows: move player
- Up arrow: jump
- Down arrow or Space: shoot the ball toward the hoop

This script uses only the `pygame` dependency listed in requirements.txt.
"""
import sys

# Prevent local files (for example a repository `math.py`) from shadowing the
# Python standard library when importing modules like `math` or `random`.
import os

# Prevent local files (for example a repository `math.py`) from shadowing the
# Python standard library when importing modules like `math` or `random`.
_saved_sys_path = sys.path.copy()
try:
    cwd = os.path.dirname(os.path.abspath(__file__))
    def is_cwd(p):
        try:
            return os.path.abspath(p) == cwd
        except Exception:
            return False

    sys.path = [p for p in sys.path if p and not is_cwd(p) and p not in ('', '.')]
    import math
    import random
    try:
        import pygame
    except ImportError:
        print("pygame not installed — run: pip install -r requirements.txt")
        sys.exit(1)
finally:
    sys.path = _saved_sys_path

# Constants
WIDTH, HEIGHT = 800, 480
FPS = 60
GROUND_Y = HEIGHT - 160


class Player:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.w = 40
        self.h = 60
        self.vx = 0
        self.vy = 0
        self.on_ground = True

    def rect(self):
        return pygame.Rect(int(self.x), int(self.y), self.w, self.h)

    def update(self, dt):
        # horizontal friction
        self.x += self.vx * dt
        # gravity
        if not self.on_ground:
            self.vy += 800 * dt
            self.y += self.vy * dt
            if self.y >= GROUND_Y - self.h:
                self.y = GROUND_Y - self.h
                self.vy = 0
                self.on_ground = True


class Ball:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.r = 12
        self.vx = 0
        self.vy = 0
        self.thrown = False
        self.frozen = False
        self.freeze_start = None

    def update(self, dt):
        # do nothing while frozen
        if self.frozen:
            return

        if self.thrown:
            self.vy += 800 * dt
            self.x += self.vx * dt
            self.y += self.vy * dt
            # floor collision
            if self.y >= GROUND_Y - self.r:
                self.y = GROUND_Y - self.r
                self.vy *= -0.3
                self.vx *= 0.8
                # come to rest
                if abs(self.vy) < 50:
                    self.vy = 0
                    self.vx = 0
                    self.thrown = False


def draw_text(surf, text, x, y, size=20, color=(255, 255, 255)):
    font = pygame.font.Font(None, size)
    img = font.render(text, True, color)
    surf.blit(img, (x, y))


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Basketball Demo")
    clock = pygame.time.Clock()

    player = Player(100, GROUND_Y - 60)
    ball = Ball(player.x + player.w // 2, player.y)

    # simple hoop
    hoop_x = WIDTH - 120
    hoop_y = 200
    hoop_w = 60
    hoop_h = 10

    score = 0

    # initial smoke test print
    print("OK")

    running = True
    while running:
        dt = clock.tick(FPS) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False

        keys = pygame.key.get_pressed()
        # movement
        player.vx = 0
        if keys[pygame.K_LEFT]:
            player.vx = -240
        if keys[pygame.K_RIGHT]:
            player.vx = 240
        if keys[pygame.K_UP] and player.on_ground:
            player.vy = -520
            player.on_ground = False

        # shoot / drop the ball
        shoot = keys[pygame.K_DOWN] or keys[pygame.K_SPACE]
        if shoot and not ball.thrown and not ball.frozen:
            # Compute a launch velocity that will pass through the hoop center.
            # Use a fixed launch angle (above horizontal) and solve for speed.
            x0 = player.x + player.w / 2
            y0 = player.y + player.h / 4
            xt = hoop_x + hoop_w / 2
            yt = hoop_y + hoop_h / 2
            dx = xt - x0
            dy = yt - y0
            g = 800.0
            # launch angle in radians (above horizontal)
            theta = math.radians(55)
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)
            tan_t = math.tan(theta)

            # v^2 = g*dx^2 / (2*cos^2(theta) * (dy + dx * tan(theta)))
            denom = 2.0 * cos_t * cos_t * (dy + dx * tan_t)
            v = None
            if denom > 0:
                v2 = g * dx * dx / denom
                if v2 > 0:
                    v = math.sqrt(v2)

            if v is None or not math.isfinite(v):
                # fallback to original heuristic if math fails
                dist = math.hypot(dx, dy)
                v = max(800.0, dist * 1.5)

            # direction: vx sign follows dx
            if dx == 0:
                vx = 0.0
            else:
                vx = (dx / abs(dx)) * v * cos_t
            # upward initial vy (negative because screen y grows downward)
            vy = -v * sin_t

            ball.vx = vx
            ball.vy = vy
            ball.thrown = True

        # if ball not thrown, position it above player
        if not ball.thrown:
            ball.x = player.x + player.w // 2
            ball.y = player.y + 10

        player.update(dt)
        ball.update(dt)

        # handle ball freeze timeout (1 second)
        if ball.frozen:
            now = pygame.time.get_ticks()
            if now - (ball.freeze_start or 0) >= 1000:
                ball.frozen = False
                ball.freeze_start = None
                # reset ball to player so the next play starts from player
                ball.x = player.x + player.w // 2
                ball.y = player.y + 10

        # hoop scoring: simple check if ball passes through hoop rectangle from above
        hoop_rect_top = pygame.Rect(hoop_x, hoop_y, hoop_w, 6)
        if ball.thrown and ball.vy > 0:
            # center of ball
            if hoop_rect_top.collidepoint(ball.x, ball.y):
                score += 1
                ball.thrown = False
                # freeze ball in place briefly before resetting
                ball.vx = ball.vy = 0
                ball.frozen = True
                ball.freeze_start = pygame.time.get_ticks()

        # draw
        screen.fill((30, 30, 40))
        # ground
        pygame.draw.rect(screen, (50, 160, 50), (0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y))
        # hoop backboard
        pygame.draw.rect(screen, (200, 200, 200), (hoop_x + hoop_w - 6, hoop_y - 40, 6, 80))
        # hoop rim
        pygame.draw.rect(screen, (200, 80, 50), (hoop_x, hoop_y, hoop_w, hoop_h))
        # player
        pygame.draw.rect(screen, (60, 120, 200), player.rect())
        # ball
        pygame.draw.circle(screen, (240, 140, 30), (int(ball.x), int(ball.y)), ball.r)

        draw_text(screen, f"Score: {score}", 10, 10, size=28)
        draw_text(screen, "Arrows: move/jump, Down/Space: shoot", 10, 40, size=18)

        pygame.display.flip()

    pygame.quit()


if __name__ == "__main__":
    main()
