import json
import math
import os
import time
import uuid
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

QUEUE = Path.home() / ".sea-openai" / "blender"


def render_shot(folder, job):
    shape = job["subject"]
    color = job["color"]
    if shape not in {"box", "cylinder", "torus"} or len(color) != 6:
        raise ValueError("Invalid shot")
    rgba = tuple(int(color[i:i+2], 16) / 255 for i in (0, 2, 4)) + (1,)
    scene = bpy.data.scenes.new("Sea video shot")
    mesh = bpy.data.meshes.new("Hero geometry")
    camera = bpy.data.cameras.new("Shot camera")
    hero = bpy.data.objects.new("Hero", mesh)
    eye = bpy.data.objects.new("Shot camera", camera)
    try:
        scene.collection.objects.link(hero)
        scene.collection.objects.link(eye)
        geometry = bmesh.new()
        if shape == "box":
            bmesh.ops.create_cube(geometry, size=1.65)
            bmesh.ops.bevel(geometry, geom=list(geometry.edges), offset=0.12, segments=4, affect='EDGES')
        elif shape == "cylinder":
            bmesh.ops.create_cone(geometry, segments=48, radius1=0.72, radius2=0.72, depth=1.8, cap_ends=True)
        else:
            rings = []
            for i in range(48):
                u = 2 * math.pi * i / 48
                ring = []
                for j in range(16):
                    v = 2 * math.pi * j / 16
                    r = 0.86 + 0.26 * math.cos(v)
                    ring.append(geometry.verts.new((r*math.cos(u), r*math.sin(u), 0.26*math.sin(v))))
                rings.append(ring)
            for i, ring in enumerate(rings):
                following = rings[(i+1) % 48]
                for j in range(16):
                    k = (j+1) % 16
                    geometry.faces.new((ring[j], following[j], following[k], ring[k]))
        geometry.to_mesh(mesh)
        geometry.free()
        hero.color = rgba
        eye.location = (3, -4, 2.5)
        eye.rotation_euler = (Vector((0, 0, 0)) - eye.location).to_track_quat('-Z', 'Y').to_euler()
        camera.type = 'ORTHO'
        camera.ortho_scale = 3.4
        scene.camera = eye
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.color_type = 'OBJECT'
        scene.display.shading.show_cavity = True
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.resolution_x = scene.render.resolution_y = 256
        scene.render.resolution_percentage = 100
        hero.rotation_euler.x = 0.55
        for i in range(24):
            if not folder.exists():
                return
            hero.rotation_euler.z = 2 * math.pi * i / 24
            scene.render.filepath = str(folder / f"{i:02}.png")
            bpy.ops.render.render(write_still=True, scene=scene.name)
    finally:
        bpy.data.scenes.remove(scene)
        bpy.data.objects.remove(hero)
        bpy.data.objects.remove(eye)
        bpy.data.meshes.remove(mesh)
        bpy.data.cameras.remove(camera)


def poll():
    QUEUE.mkdir(parents=True, exist_ok=True, mode=0o700)
    (QUEUE / "online").touch()
    for ticket in QUEUE.glob("*/ready.json"):
        folder = ticket.parent
        try:
            uuid.UUID(folder.name)
            if folder.is_symlink() or time.time() - ticket.stat().st_mtime > 150:
                continue
            claimed = folder / "working.json"
            os.rename(ticket, claimed)
        except (ValueError, FileNotFoundError):
            continue
        try:
            render_shot(folder, json.loads(claimed.read_text()))
            if folder.exists():
                (folder / "done").touch()
        except Exception as error:
            if folder.exists():
                (folder / "failure").write_text(str(error))
        break
    return 0.5


def register():
    if not bpy.app.timers.is_registered(poll):
        bpy.app.timers.register(poll, first_interval=1, persistent=True)


def unregister():
    if bpy.app.timers.is_registered(poll):
        bpy.app.timers.unregister(poll)
