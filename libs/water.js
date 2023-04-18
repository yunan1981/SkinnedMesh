/**
 * @author jbouny / https://github.com/jbouny
 *
 
 * Work based on :
 * @author Slayvin / http://slayvin.net : Flat mirror for three.js
 * @author Stemkoski / http://www.adelphi.edu/~stemkoski : An implementation of water shader based on the flat mirror
 * @author Jonas Wagner / http://29a.ch/ && http://29a.ch/slides/2012/webglwater/ : Water shader explanations in WebGL
 */

///Vector4对象的构造函数.用来创建一个四维向量的对象.Vector4对象的功能函数采用 
///定义构造的函数原型对象来实现. 
/// 
/// 用法: var p4d = new Vector4(5,3,2,1) 
/// 创建一个x坐标为5,y坐标为3,z坐标为2,齐次坐标w为1的向量 
/// NOTE: 参数(x,y,z,w)坐标为可选参数,如果不指定参数(x,y,z,w),将创建一个坐标为(0,0,0,1)的向量. 
/// NOTE: 齐次坐标,是一种用来解决坐标变换等操作的快捷方法.w称为齐次坐标。三维空间的点(x,y,z)，用四维向量表示成(x,y,z,1)和(x,y,z,0)是不一样的，前者可以用变换矩阵实现平移等操作，后者不能。 
/// NOTE: 在进行坐标和向量计算中，为了不至于混淆点和向量，另外，在进行几何变换时，为了加快运算速度，简化计算，往往使用矩阵，而在使用矩阵运算时，矩阵的乘积只能表示旋转、比例和剪切等等变换，而不能表示平移变换。因此为统一计算（使用齐次坐标在数学中的意义还要广），引入了第四个分量w，这使得原本二维坐标变成三维坐标，同理三维坐标变为四维坐标，而w称为比例因子，当w不为0时(一般设1)，表示一个坐标，一个三维坐标的三个分量x，y，z用齐次坐标表示为变为x，y，z，w的四维空间，变换成三维坐标是方式是x/w,y/w,z/w，当w为0时，在数学上代表无穷远点，即并非一个具体的坐标位置，而是一个具有大小和方向的向量。从而，通过w我们就可以用同一系统表示两种不同的量 



var THREE = require('three');

/**
 * @author jbouny / https://github.com/jbouny
 *
 * Work based on :
 * @author Slayvin / http://slayvin.net : Flat mirror for three.js
 * @author Stemkoski / http://www.adelphi.edu/~stemkoski : An implementation of water shader based on the flat mirror
 * @author Jonas Wagner / http://29a.ch/ && http://29a.ch/slides/2012/webglwater/ : Water shader explanations in WebGL
 */

THREE.Water = function (geometry, options) {

  THREE.Mesh.call(this, geometry);

  var scope = this;

  options = options || {};

  var textureWidth = options.textureWidth !== undefined ? options.textureWidth : 512;//
  var textureHeight = options.textureHeight !== undefined ? options.textureHeight : 512;//

  var clipBias = options.clipBias !== undefined ? options.clipBias : 0.0;
  var alpha = options.alpha !== undefined ? options.alpha : 1.0;
  var time = options.time !== undefined ? options.time : 0.0;
  var normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
  var sunDirection = options.sunDirection !== undefined ? options.sunDirection : new THREE.Vector3(0.7, 0.7, 0.0);
  var sunColor = new THREE.Color(options.sunColor !== undefined ? options.sunColor : 0xffffff);
  var waterColor = new THREE.Color(options.waterColor !== undefined ? options.waterColor : 0x7F7F7F);
  var eye = options.eye !== undefined ? options.eye : new THREE.Vector3(0, 0, 0);
  var distortionScale = options.distortionScale !== undefined ? options.distortionScale : 8.0;
  var side = options.side !== undefined ? options.side : THREE.FrontSide;
  var fog = options.fog !== undefined ? options.fog : false;

  //

  var mirrorPlane = new THREE.Plane();
  var normal = new THREE.Vector3();
  var mirrorWorldPosition = new THREE.Vector3();
  var cameraWorldPosition = new THREE.Vector3();
  var rotationMatrix = new THREE.Matrix4();
  var lookAtPosition = new THREE.Vector3(0, 0, - 1);
  var clipPlane = new THREE.Vector4();

  var view = new THREE.Vector3();
  var target = new THREE.Vector3();
  var q = new THREE.Vector4();

  var textureMatrix = new THREE.Matrix4();

  var mirrorCamera = new THREE.PerspectiveCamera();

  var parameters = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBFormat,
    stencilBuffer: false
  };

  var renderTarget = new THREE.WebGLRenderTarget(textureWidth, textureHeight, parameters);

  if (!THREE.Math.isPowerOfTwo(textureWidth) || !THREE.Math.isPowerOfTwo(textureHeight)) {

    renderTarget.texture.generateMipmaps = false;

  }

  var mirrorShader = {

    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      THREE.UniformsLib['lights'],
      {
        normalSampler: { value: null },
        mirrorSampler: { value: null },
        alpha: { value: 1.0 },
        time: { value: 0.0 },
        size: { value: 1.0 },
        distortionScale: { value: 8 },//{ value: 20.0 }
        textureMatrix: { value: new THREE.Matrix4() },
        sunColor: { value: new THREE.Color(0x7F7F7F) },
        sunDirection: { value: new THREE.Vector3(0.70707, 0.70707, 0) },
        eye: { value: new THREE.Vector3() },
        waterColor: { value: new THREE.Color(0x555555) }
      }
    ]),

    vertexShader: [
      'uniform mat4 textureMatrix;',
      'uniform float time;',

      'varying vec4 mirrorCoord;',
      'varying vec4 worldPosition;',

      THREE.ShaderChunk['fog_pars_vertex'],
      THREE.ShaderChunk['shadowmap_pars_vertex'],

      'void main() {',
      '	mirrorCoord = modelMatrix * vec4( position, 1.0 );',
      '	worldPosition = mirrorCoord.xyzw;',
      '	mirrorCoord = textureMatrix * mirrorCoord;',
      '	vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );',
      '	gl_Position = projectionMatrix * mvPosition;',

      THREE.ShaderChunk['fog_vertex'],
      THREE.ShaderChunk['shadowmap_vertex'],

      '}'
    ].join('\n'),

    fragmentShader: [
      'uniform sampler2D mirrorSampler;',
      'uniform float alpha;',
      'uniform float time;',
      'uniform float size;',
      'uniform float distortionScale;',
      'uniform sampler2D normalSampler;',
      'uniform vec3 sunColor;',
      'uniform vec3 sunDirection;',
      'uniform vec3 eye;',
      'uniform vec3 waterColor;',

      'varying vec4 mirrorCoord;',
      'varying vec4 worldPosition;',

      'vec4 getNoise( vec2 uv ) {',
      '	vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);',
      '	vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );',
      '	vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );',
      '	vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );',
      '	vec4 noise = texture2D( normalSampler, uv0 ) +',
      '		texture2D( normalSampler, uv1 ) +',
      '		texture2D( normalSampler, uv2 ) +',
      '		texture2D( normalSampler, uv3 );',
      '	return noise * 0.5 - 1.0;',
      '}',

      'void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {',
      '	vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );',
      '	float direction = max( 0.0, dot( eyeDirection, reflection ) );',
      '	specularColor += pow( direction, shiny ) * sunColor * spec;',
      '	diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;',
      '}',

      THREE.ShaderChunk['common'],
      THREE.ShaderChunk['packing'],
      THREE.ShaderChunk['bsdfs'],
      THREE.ShaderChunk['fog_pars_fragment'],
      THREE.ShaderChunk['lights_pars_begin'],
      THREE.ShaderChunk['shadowmap_pars_fragment'],
      THREE.ShaderChunk['shadowmask_pars_fragment'],

      'void main() {',
      '	vec4 noise = getNoise( worldPosition.xz * size );',
      '	vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',

      '	vec3 diffuseLight = vec3(0.0);',
      '	vec3 specularLight = vec3(0.0);',

      '	vec3 worldToEye = eye-worldPosition.xyz;',
      '	vec3 eyeDirection = normalize( worldToEye );',
      '	sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',

      '	float distance = length(worldToEye);',

      '	vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;',
      '	vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.z + distortion ) );',

      '	float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );',
      '	float rf0 = 0.3;',
      '	float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );',
      '	vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
      '	vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);',
      '	vec3 outgoingLight = albedo;',
      '	gl_FragColor = vec4( outgoingLight, alpha );',

      THREE.ShaderChunk['tonemapping_fragment'],
      THREE.ShaderChunk['fog_fragment'],

      '}'
    ].join('\n')

  };

  var material = new THREE.ShaderMaterial({
    fragmentShader: mirrorShader.fragmentShader,
    vertexShader: mirrorShader.vertexShader,
    uniforms: THREE.UniformsUtils.clone(mirrorShader.uniforms),
    transparent: true,
    lights: true,
    side: side,
    fog: fog
  });

  material.uniforms.mirrorSampler.value = renderTarget.texture;
  material.uniforms.textureMatrix.value = textureMatrix;
  material.uniforms.alpha.value = alpha;
  material.uniforms.time.value = time;
  material.uniforms.normalSampler.value = normalSampler;
  material.uniforms.sunColor.value = sunColor;
  material.uniforms.waterColor.value = waterColor;
  material.uniforms.sunDirection.value = sunDirection;
  material.uniforms.distortionScale.value = distortionScale;

  material.uniforms.eye.value = eye;

  scope.material = material;

  scope.onBeforeRender = function (renderer, scene, camera) {

    mirrorWorldPosition.setFromMatrixPosition(scope.matrixWorld);
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    rotationMatrix.extractRotation(scope.matrixWorld);

    normal.set(0, 0, 1);
    normal.applyMatrix4(rotationMatrix);

    view.subVectors(mirrorWorldPosition, cameraWorldPosition);

    // Avoid rendering when mirror is facing away

    if (view.dot(normal) > 0) return;

    view.reflect(normal).negate();
    //view.reflect(normal);
    view.add(mirrorWorldPosition);

    rotationMatrix.extractRotation(camera.matrixWorld);

    lookAtPosition.set(0, 0, - 1);
    //console.log(lookAtPosition);//1215
    lookAtPosition.applyMatrix4(rotationMatrix);
    lookAtPosition.add(cameraWorldPosition);

    target.subVectors(mirrorWorldPosition, lookAtPosition);
    target.reflect(normal).negate();
    target.add(mirrorWorldPosition);

    mirrorCamera.position.copy(view);
    mirrorCamera.up.set(0, 1, 0);
    mirrorCamera.up.applyMatrix4(rotationMatrix);
    mirrorCamera.up.reflect(normal);
    mirrorCamera.lookAt(target);

    mirrorCamera.far = camera.far; // Used in WebGLBackground

    mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    //console.log("mirrorCamera", mirrorCamera);

    // Update the texture matrix
    textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    textureMatrix.multiply(mirrorCamera.projectionMatrix);
    textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

    // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
    // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf

    mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition);
    mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);

    clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);

    var projectionMatrix = mirrorCamera.projectionMatrix;

    q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    q.z = - 1.0;
    q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

    // Calculate the scaled plane vector
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

    // Replacing the third row of the projection matrix
    projectionMatrix.elements[2] = clipPlane.x;
    projectionMatrix.elements[6] = clipPlane.y;
    projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
    projectionMatrix.elements[14] = clipPlane.w;

    eye.setFromMatrixPosition(camera.matrixWorld);

    //

    var currentRenderTarget = renderer.getRenderTarget();

    var currentVrEnabled = renderer.xr.enabled;
    var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

    scope.visible = false;

    renderer.xr.enabled = false; // Avoid camera modification and recursion
    renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

    renderer.render(scene, mirrorCamera, renderTarget, true);

    scope.visible = true;

    renderer.xr.enabled = currentVrEnabled;
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;

    renderer.setRenderTarget(currentRenderTarget);

  };

};

THREE.Water.prototype = Object.create(THREE.Mesh.prototype);
THREE.Water.prototype.constructor = THREE.Water;