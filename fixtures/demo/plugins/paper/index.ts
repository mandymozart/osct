import type { PluginApi } from "osct-plugin-api";

/**
 * Paper: a video or an image on a bent sheet of paper. The sheet is a model file the author picks in the component's
 * `sheet` row – a Library model, or a file next to the node – so a new sheet is an upload, not code. The component loads
 * it (`api.loadModel`), fits its mesh to the plane the node shows its picture on and puts it in the plane's place; the
 * node stays what it is: a video plays, pauses, keys and takes layers as before.
 *
 * A sheet is one mesh with UVs 0–1 across it, bent as the artist likes, at any size, place and turn in its file. The
 * fit reads the sheet's own axes from its UVs – where u grows is the picture's right, where v grows its bottom – and
 * scales it to the plane: 1 wide and 1 high around the centre (the engine then gives a video its proportions), the bend
 * along z in the same measure as the width, its lowest point on the plane. A sheet made for another proportion than the
 * picture's stretches with the picture.
 */

type Three = PluginApi["three"];
type Geometry = InstanceType<Three["BufferGeometry"]>;
type Mesh = InstanceType<Three["Mesh"]>;
type Object3D = InstanceType<Three["Object3D"]>;

/** The first mesh of a model that has positions and UVs */
const sheetMesh = (scene: Object3D): Mesh | null => {
  let found: Mesh | null = null;
  scene.traverse(child => {
    const mesh = child as Mesh;
    if (!found && mesh.isMesh && mesh.geometry.getAttribute("position") && mesh.geometry.getAttribute("uv")) found = mesh;
  });
  return found;
};

/**
 * The model's sheet as a geometry in the plane's measure – x and y from −0.5 to 0.5, z the bend from 0 up, the UVs as a
 * plane's (v up) – or null when the model holds no mesh with UVs, or its UVs span no area
 */
const sheetGeometry = (three: Three, scene: Object3D): Geometry | null => {
  const mesh = sheetMesh(scene);
  if (!mesh) return null;
  scene.updateMatrixWorld(true);
  const source = mesh.geometry;
  const position = source.getAttribute("position");
  const uv = source.getAttribute("uv");
  const count = position.count;
  // The vertices where the file puts them, and the UVs as a picture on a plane reads them (glTF's v runs down)
  const points = Array.from({ length: count }, (_, i) => new three.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  const us = Array.from({ length: count }, (_, i) => uv.getX(i));
  const vs = Array.from({ length: count }, (_, i) => 1 - uv.getY(i));
  // The sheet's own axes: the plane through the points that follows the UVs best (least squares)
  const centre = points.reduce((sum, point) => sum.add(point), new three.Vector3()).divideScalar(count);
  const meanU = us.reduce((sum, u) => sum + u, 0) / count;
  const meanV = vs.reduce((sum, v) => sum + v, 0) / count;
  let uu = 0;
  let uvSum = 0;
  let vv = 0;
  const alongU = new three.Vector3();
  const alongV = new three.Vector3();
  points.forEach((point, i) => {
    const du = us[i] - meanU;
    const dv = vs[i] - meanV;
    uu += du * du;
    uvSum += du * dv;
    vv += dv * dv;
    alongU.addScaledVector(point, du);
    alongV.addScaledVector(point, dv);
  });
  const determinant = uu * vv - uvSum * uvSum;
  if (Math.abs(determinant) < 1e-9) return null;
  const right = alongU.clone().multiplyScalar(vv).addScaledVector(alongV, -uvSum).divideScalar(determinant);
  const up = alongV.clone().multiplyScalar(uu).addScaledVector(alongU, -uvSum).divideScalar(determinant);
  if (right.lengthSq() < 1e-12) return null;
  right.normalize();
  up.addScaledVector(right, -up.dot(right));
  if (up.lengthSq() < 1e-12) return null;
  up.normalize();
  const out = new three.Vector3().crossVectors(right, up);
  // In those axes, scaled to the plane: the footprint 1 × 1 around the centre, the bend in widths, from 0 up
  const local = points.map(point => {
    const offset = point.clone().sub(centre);
    return [offset.dot(right), offset.dot(up), offset.dot(out)];
  });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  local.forEach(point => point.forEach((value, axis) => {
    min[axis] = Math.min(min[axis], value);
    max[axis] = Math.max(max[axis], value);
  }));
  const width = max[0] - min[0];
  const height = max[1] - min[1];
  if (width < 1e-9 || height < 1e-9) return null;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  local.forEach(([x, y, z], i) => {
    positions.set([(x - (min[0] + max[0]) / 2) / width, (y - (min[1] + max[1]) / 2) / height, (z - min[2]) / width], i * 3);
    uvs.set([us[i], vs[i]], i * 2);
  });
  // The triangles counter-clockwise seen from the front (+z), whichever way the file wound them
  const indices = source.index ? Array.from(source.index.array as ArrayLike<number>) : Array.from({ length: count }, (_, i) => i);
  let area = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    area += (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) - (positions[c] - positions[a]) * (positions[b + 1] - positions[a + 1]);
  }
  if (area < 0) for (let i = 0; i + 2 < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new three.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export const register = (api: PluginApi): void => {
  api.registerComponent("paper", {
    description: "Shows the picture on a bent sheet of paper – a model file from the Library.",
    nodeTypes: ["video", "image"],
    params: {
      sheet: { kind: "model", default: "", description: "The sheet: a model of one bent plane with UVs across it. None keeps the picture flat." },
    },
  }, ({ object, params, three }) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) {
      api.log("paper needs a node that shows its picture on a plane");
      return;
    }
    const plane = mesh.geometry;
    let sheet: Geometry | null = null;
    let wanted = "";
    let disposed = false;
    /** The sheet in the plane's place, or the plane again (null) */
    const show = (geometry: Geometry | null) => {
      const previous = sheet;
      sheet = geometry;
      mesh.geometry = (geometry ?? plane) as Mesh["geometry"];
      previous?.dispose();
    };
    const use = (src: string) => {
      wanted = src;
      if (!src) {
        show(null);
        return;
      }
      api.loadModel(src).then(model => {
        if (disposed || wanted !== src) return;
        const geometry = sheetGeometry(three, model.scene);
        if (!geometry) api.log(`${src} holds no mesh with UVs across it – the picture stays flat`);
        show(geometry);
      }).catch(error => {
        if (disposed || wanted !== src) return;
        api.log(`the sheet ${src} did not load – the picture stays flat`, error);
        show(null);
      });
    };
    use(String(params.sheet ?? ""));
    return {
      tune: next => {
        const src = String(next.sheet ?? "");
        if (src !== wanted) use(src);
        return true;
      },
      dispose: () => {
        disposed = true;
        mesh.geometry = plane;
        sheet?.dispose();
        plane.dispose();
      },
    };
  });
};
