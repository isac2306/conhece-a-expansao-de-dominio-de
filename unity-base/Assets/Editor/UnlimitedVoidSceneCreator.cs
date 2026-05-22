using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnlimitedVoid.UnityBase.App;
using UnlimitedVoid.UnityBase.Rendering;
using UnlimitedVoid.UnityBase.Vision;

namespace UnlimitedVoid.UnityBase.Editor
{
    public static class UnlimitedVoidSceneCreator
    {
        private const string ScenesFolder = "Assets/Scenes";
        private const string MaterialsFolder = "Assets/Materials";
        private const string ScenePath = "Assets/Scenes/UnlimitedVoidDemo.unity";

        [MenuItem("Tools/Unlimited Void/Create Demo Scene")]
        public static void CreateDemoScene()
        {
            EnsureFolder("Assets", "Scenes");
            EnsureFolder("Assets", "Materials");

            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var mainCameraObject = new GameObject("Main Camera");
            var camera = mainCameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.01f, 0.03f, 0.05f, 1f);
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            mainCameraObject.tag = "MainCamera";
            mainCameraObject.transform.position = new Vector3(0f, 0f, -10f);

            var backdropQuad = CreateQuad("BackdropQuad", new Vector3(0f, 0f, 8f));
            var foregroundQuad = CreateQuad("ForegroundQuad", new Vector3(0f, 0f, 1f));
            var domainRoot = new GameObject("DomainRoot");
            var webcamRoot = new GameObject("WebcamRoot");
            var debugProviders = new GameObject("DebugProviders");

            var backdropMaterial = GetOrCreateMaterial(
                "UnlimitedVoidBackdrop.mat",
                Shader.Find("UnlimitedVoid/Backdrop") ?? Shader.Find("Unlit/Color"));
            var foregroundMaterial = GetOrCreateMaterial(
                "UnlimitedVoidForeground.mat",
                Shader.Find("UnlimitedVoid/Foreground Composite") ?? Shader.Find("Unlit/Texture"));

            var backdropRenderer = backdropQuad.GetComponent<Renderer>();
            backdropRenderer.sharedMaterial = backdropMaterial;
            var foregroundRenderer = foregroundQuad.GetComponent<Renderer>();
            foregroundRenderer.sharedMaterial = foregroundMaterial;

            var backdropController = backdropQuad.AddComponent<DomainBackdropController>();
            var foregroundController = foregroundQuad.AddComponent<ForegroundCompositeController>();
            var webcamFeed = webcamRoot.AddComponent<WebcamFeedController>();
            var activationController = domainRoot.AddComponent<DomainActivationController>();
            var appController = domainRoot.AddComponent<DomainAppController>();
            var debugGestureProvider = debugProviders.AddComponent<DebugHoldGestureProvider>();
            var debugMaskProvider = debugProviders.AddComponent<DebugEllipseMaskProvider>();

            AssignSerializedObject(backdropController, "targetRenderer", backdropRenderer);
            AssignSerializedObject(foregroundController, "targetRenderer", foregroundRenderer);
            AssignSerializedObject(foregroundController, "webcamFeed", webcamFeed);
            AssignSerializedObject(foregroundController, "maskProviderSource", debugMaskProvider);
            AssignSerializedObject(activationController, "backdropController", backdropController);
            AssignSerializedObject(appController, "webcamFeed", webcamFeed);
            AssignSerializedObject(appController, "activationController", activationController);
            AssignSerializedObject(appController, "handLandmarkProviderSource", debugGestureProvider);

            EditorSceneManager.SaveScene(SceneManager.GetActiveScene(), ScenePath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Selection.activeGameObject = domainRoot;
            EditorGUIUtility.PingObject(AssetDatabase.LoadAssetAtPath<Object>(ScenePath));

            Debug.Log($"Unlimited Void demo scene created at {ScenePath}");
        }

        private static GameObject CreateQuad(string objectName, Vector3 position)
        {
            var quad = GameObject.CreatePrimitive(PrimitiveType.Quad);
            quad.name = objectName;
            quad.transform.position = position;
            quad.transform.localScale = new Vector3(17.8f, 10f, 1f);
            return quad;
        }

        private static Material GetOrCreateMaterial(string fileName, Shader shader)
        {
            var materialPath = $"{MaterialsFolder}/{fileName}";
            var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if (material != null)
            {
                if (material.shader != shader && shader != null)
                {
                    material.shader = shader;
                    EditorUtility.SetDirty(material);
                }

                return material;
            }

            material = new Material(shader);
            AssetDatabase.CreateAsset(material, materialPath);
            return material;
        }

        private static void EnsureFolder(string parent, string child)
        {
            var combined = Path.Combine(parent, child).Replace("\\", "/");
            if (!AssetDatabase.IsValidFolder(combined))
            {
                AssetDatabase.CreateFolder(parent, child);
            }
        }

        private static void AssignSerializedObject(Object target, string propertyName, Object value)
        {
            var serializedObject = new SerializedObject(target);
            var property = serializedObject.FindProperty(propertyName);
            if (property == null)
            {
                Debug.LogWarning($"Could not find serialized property '{propertyName}' on {target.name}.");
                return;
            }

            property.objectReferenceValue = value;
            serializedObject.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(target);
        }
    }
}
