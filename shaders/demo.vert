precision mediump float;

attribute vec3 position;
uniform mat4 proj;
uniform mat4 view;
uniform vec3 color;

void main() {
  gl_Position = (
    proj *
    view *
    vec4(position, 1.0)
  );
}
