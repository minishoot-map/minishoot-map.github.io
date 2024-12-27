using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using UnityEngine;
using System.IO;
using UnityEngine.SceneManagement;
using System.Collections.Generic;
using UnityEngine.Tilemaps;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Linq;
using System.Text;

// Required:
// GameManager:
// 1. basePath (ends in slash or backslash!):
    /*
private static string basePath{ get{ return
""" """
; } }
    */
    // This will be the output directory.

// 2. Replace Start() with contents of this file

// Recommended:
// ParticleMaster (remove foreach(): Init())
// Pool (remove body: PreWarmPool())
// Fx (remove body: AddReflection(), AddShadow(), AddShipFx(), AddWaterParticle(), RestoreShipVisual())


// "Overworld", "Cave", "CaveExtra", "Dungeon1", "Dungeon2", "Dungeon3", "Dungeon4", "Dungeon5", "Temple1", "Temple2", "Temple3", "Tower", "CaveArena", "Snow"
public partial class GameManager : MonoBehaviour
{
	static StreamWriter errorsSw;

    delegate void Writer(BinaryWriter w, object v);
    struct Schema {
        public int type; // 0 - prim, 1 - record, 2 - array
        public Type itType;
        public int? textureIndex;

        public Writer primitiveWriter;

        public Type[] memberTypes;
        public string[] memberNames;

        public Type elementType;
    }

    struct None {};
    struct Sprite { public int sprite; }
    struct Reference { public int reference; }
    struct Any { public int schema; public object value; }

    static Sprite toSprite(int number) { return new Sprite{ sprite = number }; }
    static Reference toReference(int number) { return new Reference{ reference = number }; }

    static List<Serializer> serializers;
    static Dictionary<Type, Serializer> typeSerializers;

    abstract class Serializer {
        public int index;
        public Schema schema;
        public virtual void prepare() {}
        // returns one of: some primitive (+ string, Vector2), Record, Sprite, Reference, Any, Array
        public abstract object serialize(object it);
    }

    class RecordSerializer : Serializer {
        public Func<object, object> ser;
        public Type outType;
        Serializer[] sers;
        Serializer baseSerializer;

        public override void prepare() {
            if(sers != null) return;

            var elementTypes = outType.GetGenericArguments();
            var len = elementTypes.Length;
            sers = new Serializer[len];
            for(var i = 0; i < len; i++) {
                sers[i] = getSerializer(elementTypes[i]);
            }
            var bt = schema.itType.BaseType;
            if(bt != null) baseSerializer = getSerializer(bt);
        }

        public override object serialize(object it) {
            prepare();
            var result = (ITuple)ser(it);
            var props = new object[sers.Length + (baseSerializer != null ? 1 : 0)];
            for(var i = 0; i < sers.Length; i++) {
                props[i] = sers[i].serialize(result[i]);
            }
            if(baseSerializer != null) {
                props[props.Length-1] = baseSerializer.serialize(it);
            }
            return props;
        }
    }

    class ArraySerializer : Serializer {
        public Type elementType;
        Serializer elementSerializer;

        public override void prepare() {
            if(elementSerializer != null) return;
            elementSerializer = getSerializer(elementType);
        }

        public override object serialize(object it) {
            prepare();
            var arr = (Array)it;
            var result = new object[arr.Length];
            for(var i = 0; i < arr.Length; i++) {
                result[i] = elementSerializer.serialize(arr.GetValue(i));
            }
            return result;
        }
    }

    class PrimSerializer : Serializer {
        public override object serialize(object it) {
            return it;
        }
    }

    static Any serialized(object it) {
        var s = getSerializer(it.GetType()); // Exact match required!
        return new Any{ schema = s.index, value = s.serialize(it) };
    }

    static Serializer getSerializer(Type type) {
        Serializer it;
        if(typeSerializers.TryGetValue(type, out it)) return it;
        else if(type.IsArray) return addarr(type);
        else return addrec(new string[]{}, (object input) => new ValueTuple(), type, typeof(ValueTuple));
    }

    static void setupSerializer(Serializer ser, Type type, Schema schema) {
        var index = serializers.Count;
        ser.schema = schema;
        ser.index = index;
        serializers.Add(ser);
        typeSerializers.Add(type, ser);
    }

    static Serializer addrec(string[] names, Func<object, object> it, Type t, Type r) {
        if(!typeof(System.Runtime.CompilerServices.ITuple).IsAssignableFrom(r)) throw new Exception("type " + r.FullName + " is not tuple");

        var ser = new RecordSerializer();
        ser.ser = it;
        ser.outType = r;
        setupSerializer(ser, t, new Schema{ type = 1, itType = t, memberNames = names, memberTypes = r.GetGenericArguments() });

        return ser;
    }
    static Serializer addrec<T, R>(Func<T, R> it, params string[] names) {
        return addrec(names, (input) => (object)it((T)input), typeof(T), typeof(R));
    }

    static Serializer addarr(Type arrType) {
        if(!arrType.IsArray) throw new Exception("" + arrType.FullName + " is not array");

        var ser = new ArraySerializer();
        ser.elementType = arrType.GetElementType();
        setupSerializer(ser, arrType, new Schema{ type = 2, itType = arrType, elementType = ser.elementType });

        return ser;
    }

    static Serializer addprim(Type prim, Writer w) {
        var ser = new PrimSerializer();
        setupSerializer(ser, prim, new Schema{ type = 0, itType = prim, primitiveWriter = w });
        return ser;
    }
    delegate void TWriter<T>(BinaryWriter bw, T it);
    static Serializer addprim<T>(TWriter<T> w) {
        return addprim(typeof(T), (bw, it) => w(bw, (T)it));
    }

    static Dictionary<GameObject, int> objects;
    static List<GameObject> objectList;
    static int texturesCount;
    static Dictionary<long, int> textureIndices;
    static Dictionary<string, int> textIndices;
    static int curTextIndex;

    static List<Vector2[][]> colliderPolygons;

    static int getObjectRef(GameObject o) {
        if(o == null) return -1;
        int index;
        if(!objects.TryGetValue(o, out index)) return -1;
        else return index;
    }

    static void prepObject(GameObject o) {
        var a = "";
        {
            Tilemap[] cs = o.GetComponents<Tilemap>();
            for (int i = 0; i < cs.Length; i++) {
                var c = cs[i];
                c.enabled = false;
                c.enabled = true;

                //errorsSw.WriteLine(a + "Tilemap (a): " + c.origin + " " + c.size + " "
                //    + c.localBounds + " " + c.GetUsedTilesCount() + " " + c.GetUsedSpritesCount());

                c.RefreshAllTiles();

                //errorsSw.WriteLine(a + "Tilemap (b): " + c.origin + " " + c.size + " "
                //    + c.localBounds + " " + c.GetUsedTilesCount() + " " + c.GetUsedSpritesCount());
                //a = "--";
            }
        }
        {
            TilemapCollider2D[] cs = o.GetComponents<TilemapCollider2D>();
            for (int i = 0; i < cs.Length; i++)
            {
                var c = cs[i];
                c.enabled = false;
                c.enabled = true;

                //errorsSw.WriteLine(a + "Collider (a): " + c.hasTilemapChanges);

                c.ProcessTilemapChanges();

                //errorsSw.WriteLine(a + "Collider (b): " + c.hasTilemapChanges);
                //a = "--";
            }
        }
        {
            CompositeCollider2D[] cs = o.GetComponents<CompositeCollider2D>();
            for (int i = 0; i < cs.Length; i++)
            {
                var c = cs[i];
                c.enabled = false;
                c.enabled = true;
                //errorsSw.WriteLine(a + "Composite (a): " + c.generationType.ToString() + " "
                //    + c.geometryType.ToString() + " " + c.pathCount + " " + c.pointCount);
                c.GenerateGeometry();
                //errorsSw.WriteLine(a + "Composite (b): " + c.generationType.ToString() + " "
                //    + c.geometryType.ToString() + " " + c.pathCount + " " + c.pointCount);
                //a = "--";
            }
        }

        int index;
        if(!objects.TryGetValue(o, out index)) {
            index = objectList.Count;
            objectList.Add(o);
            objects.Add(o, index);
        }
        var cc = o.transform.GetChildCount();
        for(int i = 0; i < cc; i++) {
            prepObject(o.transform.GetChild(i).gameObject);
        }
    }

    static Reference componentRef(object component) {
        var refI = -1;
        var c = component as Component;
        if(c != null) refI = getObjectRef(c.gameObject);
        return toReference(refI);
    }

    static Texture2D duplicateTexture(Texture2D source)
    {
        RenderTexture temporary = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.Default, RenderTextureReadWrite.Linear);
        Graphics.Blit(source, temporary);
        RenderTexture active = RenderTexture.active;
        RenderTexture.active = temporary;
        Texture2D texture2D = new Texture2D(source.width, source.height);
        texture2D.ReadPixels(new Rect(0f, 0f, (float)temporary.width, (float)temporary.height), 0, 0);
        texture2D.Apply();
        RenderTexture.active = active;
        RenderTexture.ReleaseTemporary(temporary);
        return texture2D;
    }

	static int tryAddSprite(SpriteRenderer sprite) {
		if(sprite == null) return -1;

		try {
			long key = sprite.sprite.texture.GetNativeTexturePtr().ToInt64();
			int existingIndex;
			if(textureIndices.TryGetValue(key, out existingIndex)) {
				return existingIndex;
            }

            var textureCount = texturesCount++;
            textureIndices.Add(key, textureCount);
            byte[] array = duplicateTexture(sprite.sprite.texture).EncodeToPNG();
            using (FileStream fileStream = new FileStream(basePath + "sprites/" + textureCount + ".png", FileMode.Create, FileAccess.Write)) {
				fileStream.Write(array, 0, array.Length);
            }
			return textureCount;
        }
        catch (Exception e) {
            errorsSw.WriteLine(e.Message);
            errorsSw.WriteLine(e.StackTrace);
            errorsSw.WriteLine("");
        }

		return -1;
	}

    static object prop(object it, params string[] names) {
        var type = it.GetType();
        for(var i = 0; i < names.Length; i++) try {
            var prop = type.GetProperty(names[i], BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if(prop != null) {
                it = prop.GetValue(it);
                type = prop.PropertyType;
            }
            else {
                var field = type.GetField(names[i], BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                if(field != null) {
                    it = field.GetValue(it);
                    type = field.FieldType;
                }
                else {
                    throw new Exception("cound not find field `" + names[i] + "`");
                }
            }
        } catch(Exception e) {
            throw new Exception("typeof(it) = " + it.GetType().FullName + ", type = " + type.FullName + ", i = " + i + ", props = [" + string.Join(", ", names) + "]", e);
        }
        return it;
    }

    static byte[] compactInt(int iit) {
        var bytes = new List<byte>();
        // I hope it won't crash w/ overflow for negatives ...
        uint it = iit < 0 ? (uint)int.MaxValue + (uint)-iit : (uint)iit;
        while(true) {
            var div = it >> 7;
            if(div == 0) {
                bytes.Add((byte)it);
                break;
            }
            else {
                bytes.Add((byte)(it | (1u << 7)));
                it = div - 1;
            }
        };
        return bytes.ToArray();
    }

    static bool isPZero(float it) {
        return it == 0.0f && 1 / it > 0;
    }
    static byte[] compactFloat(float it) {
        if(isPZero(it)) {
            return new byte[]{ (byte)0b1111_1111 };
        }
        var b = BitConverter.GetBytes(it);
        if (BitConverter.IsLittleEndian) Array.Reverse(b);
        if(b.Length != 4) throw new Exception();

        if(b[0] == 0b1111_1111 || b[0] == 0b0111_1111) {
            throw new Exception("Scary numbers, not tested");
            // return new byte[]{ (byte)0b0111_11111, b[0], b[1], b[2], b[3] };
        }
        else return b;
    }

    static byte[] compactVector2(Vector2 it) {
        var px0 = isPZero(it.x);
        if(px0 && isPZero(it.y)) {
            return new byte[]{ (byte)0b0111_1111 };
        }
        var bytes = new List<byte>();
        if(px0) {
            bytes.Add((byte)0b1111_1111);
            bytes.AddRange(compactFloat(it.y));
            return bytes.ToArray();
        }

        var bx = BitConverter.GetBytes(it.x);
        if (BitConverter.IsLittleEndian) Array.Reverse(bx);
        if(bx.Length != 4) throw new Exception();

        if(bx[0] == 0b1111_1111 || bx[0] == 0b0111_1111 || bx[0] == 0b1111_1110) {
            throw new Exception("Scary numbers, not tested");
            // bytes.Add((byte)0b1111_1110);
            // fallthrough...
        }

        bytes.AddRange(bx);
        bytes.AddRange(compactFloat(it.y));
        return bytes.ToArray();
    }

    static int getSchemaI(Type t) {
        return typeSerializers[t].index;
    }
    static Schema getSchema(int i) {
        return serializers[i].schema;
    }

    static void writeDynamic(BinaryWriter w, object v, int schemaI) {
        try {
			var s = getSchema(schemaI);
            if(s.type == 0) s.primitiveWriter(w, v);
            else if(s.type == 1) {
                var props = v as object[];
                var bt = s.itType.BaseType;
                if(props.Length != s.memberTypes.Length + (bt != null ? 1 : 0)) throw new Exception("#props = " + props.Length + ", #members = " + s.memberTypes.Length);
                for(var i = 0; i < s.memberTypes.Length; i++) {
                    writeDynamic(w, props[i], getSchemaI(s.memberTypes[i]));
                }
                if(bt != null) {
                    writeDynamic(w, props[props.Length-1], getSchemaI(bt));
                }
            }
            else if(s.type == 2) {
                var props = v as object[];
                var elSchema = getSchemaI(s.elementType);
                w.Write(compactInt(props.Length));
                for(var i = 0; i < props.Length; i++) {
                    writeDynamic(w, props[i], elSchema);
                }
            }
            else {
                throw new Exception("type = " + s.type);
            }
        } catch(Exception e) {
            throw new Exception("Dynamic = " + v.GetType().FullName + ", " + schemaI, e);
        }
    }

    static int addPolygons(Vector2[][] polygons) {
        for(var i = 0; i < colliderPolygons.Count; i++) {
            var c = colliderPolygons[i];
            if(c.Length != polygons.Length) continue;
            bool same = true;
            for(var j = 0; same && j < c.Length; j++) {
                var cp = c[j];
                var polygon = polygons[j];
                for(var k = 0; same && k < c.Length; k++) {
                    if(cp[k] != polygon[k]) same = false;
                }
            }
            if(same) return i;
        }
        var res = colliderPolygons.Count;
        colliderPolygons.Add(polygons);
        return res;
    }

    static string jsStr(string it) {
        return System.Web.HttpUtility.JavaScriptStringEncode(it, true);
    }

    private void Start() {
        var scenes = new string[]{ "Overworld", "Cave", "CaveExtra", "Dungeon1", "Dungeon2", "Dungeon3", "Dungeon4", "Dungeon5", "Temple1", "Temple2", "Temple3", "Tower", "CaveArena", "Snow" };

        var loadedSceneNames = new List<string>();

        try {
            Debug.Log("retrive_objects--Started");

            Application.runInBackground = true;
            GameManager.State = GameState.Loading;

            if (this.locationLoader != null) {
                Debug.Log("retrive_objects--locationLoader.alpha = 0");
                this.locationLoader.alpha = 0f;
            }
            if (this.preloader != null) {
                Debug.Log("retrive_objects--StartLoading");
                this.preloader.StartLoading(true);
            }
            DG.Tweening.DOTween.SetTweensCapacity(1000, 200);

            var loadedCount = 0;
            var expectedLoadedCount = 0;
            SceneManager.sceneLoaded += (loadedScene, _) => {
                // This executes after the first Update()

                Debug.Log("retrive_objects--scene loaded: " + loadedScene.name);
                loadedCount++;
                if(loadedCount != expectedLoadedCount) return;

                // This executes before any loaded objects get Update()'d
                using(errorsSw = new StreamWriter(basePath + "errors.txt", false)) try {
                    Debug.Log("retrive_objects--Global objects");
                    InitializeGlobalObjects();
                    Debug.Log("retrive_objects--Global objects done");

                    for(int i = 0; i < loadedSceneNames.Count; i++) {
                        var scene = SceneManager.GetSceneByName(loadedSceneNames[i]);
                        Debug.Log("retrive_objects--Scene " + i + "(" + scenes[i] + ") = " + (scene == null));
                        var item = scene.GetRootGameObjects()[0].GetComponent<SceneAsyncActivationGO>();
                        if(item == null) continue;
                        if(item.Progress >= 1f) continue;

                        foreach(GameObject gameObject in item.wrapperObjects) {
                            foreach(object obj in gameObject.transform) {
                                (obj as Transform).gameObject.SetActive(true);
                            }
                        }
                        item.Progress = 1f;
                    }
                    Debug.Log("retrive_objects--scenes done");

                    if (!this.gameFullyLoaded) {
                        Action gameLocationLoaded = GameManager.GameLocationLoaded;
                        if (gameLocationLoaded != null) gameLocationLoaded();

                        Action gamePostLoaded = GameManager.GamePostLoaded;
                        if (gamePostLoaded != null) gamePostLoaded();

                        this.gameFullyLoaded = true;
                    }
                    Debug.Log("retrive_objects--callbacks done");

                    Write();
                    Debug.Log("retrive_objects--done!");
                }
                catch(Exception e) {
                    errorsSw.WriteLine(e.ToString());
                }
                finally {
                    UpdateLoadPercent(1f, true);
                    Application.Quit();
                }
            };

            // This executes before the first Update()
            if (!FindObjectOfType<GlobalObjects>()) {
                Debug.Log("retrive_objects--loading global");
                SceneManager.LoadScene(SRScenes.GlobalObjects, LoadSceneMode.Additive);
                Debug.Log("retrive_objects--loaded global");
                expectedLoadedCount++;
            }

            for(int i = 0; i < scenes.Length; i++) {
                if (!SceneManager.GetSceneByName(scenes[i]).isLoaded) {
                    Debug.Log("retrive_objects--loading " + scenes[i]);
                    SceneManager.LoadScene(scenes[i], LoadSceneMode.Additive);
                    Debug.Log("retrive_objects--loaded " + scenes[i]);
                    loadedSceneNames.Add(scenes[i]);
                    expectedLoadedCount++;
                }
            }

            Directory.CreateDirectory(basePath);
            Directory.CreateDirectory(basePath + "sprites/");
        }
        catch(Exception e) {
            Debug.Log("retrive_objects--Error setup");
            Debug.Log(e.ToString());
            Application.Quit();
        }

        Debug.Log("retrive_objects--everything setup");

        UpdateLoadPercent(0.5f, true);
    }

    private static void Write() {
        serializers = new List<Serializer>();
        typeSerializers = new Dictionary<Type, Serializer>();

        objects = new Dictionary<GameObject, int>();
        objectList = new List<GameObject>();
        texturesCount = 0;
        textureIndices = new Dictionary<long, int>();
        textIndices = new Dictionary<string, int>();
        curTextIndex = 1; // 0 is new string tag

        colliderPolygons = new List<Vector2[][]>();

        for(int i = 0; i < SceneManager.sceneCount; i++) {
            Scene scene = SceneManager.GetSceneAt(i);
            var objs = scene.GetRootGameObjects();
            foreach(var obj in objs) {
                prepObject(obj);
            }
        }

        addprim<None>((w, v) => { throw new Exception("none is not writable"); });
        addprim<bool>((w, v) => w.Write(v ? (byte)1 : (byte)0));
        addprim<int>((w, v) => w.Write(compactInt(v)));
        addprim<float>((w, v) => w.Write(compactFloat(v)));
        addprim<string>((w, v) => {
            if(v == null) throw new Exception("String is null (not supported). Please handle yourself");

            var index = 0;
            if(textIndices.TryGetValue(v, out index)) {
                w.Write(compactInt(index));
            }
            else {
                w.Write((byte)0);

                byte[] bytes = System.Text.Encoding.UTF8.GetBytes(v);
                for(var i = 0; i < bytes.Length; i++) if((sbyte)bytes[i] <= 0) throw new Exception(v);
                if(bytes.Length == 0) w.Write((byte)(1u << 7));
                else {
                    if(bytes.Length == 1 && bytes[0] == (1u << 7)) throw new Exception();
                    bytes[bytes.Length - 1] = (byte)(bytes[bytes.Length - 1] | (1u << 7));
                    w.Write(bytes);
                }

                textIndices.Add(v, curTextIndex++);
            }
        });
        addprim<Reference>((w, v) => w.Write(compactInt(v.reference)));
        addprim<Sprite>((w, v) => w.Write(compactInt(v.sprite)));
        var anySerializer = addprim<Any>((w, v) => {
            w.Write(compactInt(v.schema));
            writeDynamic(w, v.value, v.schema);
        });
        addprim<Vector2>((w, v) => w.Write(compactVector2(v)));

        addrec<Jar, (int, int, Sprite)>(v => {
            var spriteI = toSprite(tryAddSprite(v.GetComponentInChildren<SpriteRenderer>()));
            return ((int)prop(v, "size"), Convert.ToInt32(prop(v, "drop")), spriteI);
        }, "size", "dropType", "spriteI");
        addrec<Enemy, (Sprite, int, int)>(v => (toSprite(tryAddSprite(v.Sprite)), v.Size, v.Tier), "spriteI", "size", "tier");
        addrec<CrystalDestroyable, (bool, int)>(v => ((bool)prop(v, "dropXp"), Convert.ToInt32(prop(v, "size"))), "dropXp", "size");
        addrec<ScarabPickup, ValueTuple<Reference>>(v => {
            int oIndex;
            if(!objects.TryGetValue(prop(v, "destroyable", "gameObject") as GameObject, out oIndex)) oIndex = -1;
            return new ValueTuple<Reference>(toReference(oIndex));
        }, "container");

        addrec<Collider2D, (bool, Vector2)>(v => (v.isTrigger, v.offset), "isTrigger", "offset");
        addrec<BoxCollider2D, (Vector2, bool)>(v => (v.size, v.usedByComposite), "size", "usedByComposite");

        addrec<CapsuleCollider2D, ValueTuple<Vector2>>(v => new(v.size), "size");
        addrec<CircleCollider2D, ValueTuple<float>>(v => new(v.radius), "radius");
        addrec<PolygonCollider2D, (int, bool)>(v => {
            var polygonI = addPolygons(new[]{ v.points });
            return (polygonI, v.usedByComposite);
        }, "points", "usedByComposite");
        addrec<CompositeCollider2D, ValueTuple<int>>(v => {
            var pathCount = v.pathCount;
            var polygons = new Vector2[pathCount][];
            for(int i = 0; i < pathCount; i++) {
                var points = new Vector2[v.GetPathPointCount(i)];
                v.GetPath(i, points);
                polygons[i] = points;
            }
            var polygonsI = addPolygons(polygons);
            return new(polygonsI);
        }, "polygons");

        addrec<Transition, ValueTuple<Reference>>(v => {
            Transition dest = v.sameLocTransition;
            if (dest == null) {
                LocationManager.TransitionsLoaded.TryGetValue(v.DestinationId, out dest);
            }
            return new ValueTuple<Reference>(toReference(getObjectRef(dest?.gameObject)));
        }, "destI");
        addrec<Destroyable, (int, bool, bool, bool)>(v => {
            return (v.HpMax, v.Permanent, v.Invincible, Convert.ToBoolean(prop(v, "clampDamage")));
        }, "hp", "permanent", "invincible", "flatDamage");
        addrec<Transform, (Vector2, Vector2, float)>(v => (v.localPosition, v.localScale, v.localRotation.eulerAngles.z), "position", "scale", "rotation");

        addrec<GameObject, (string, int, Any[], GameObject[])>(v => {
            var t = v.transform;
            var children = new GameObject[t.GetChildCount()];
            for(var i = 0; i < children.Length; i++) children[i] = t.GetChild(i).gameObject;

            var c = v.GetComponents<Component>();
            var components = new Any[c.Length];
            for(var i = 0; i < c.Length; i++) components[i] = serialized(c[i]);

            return (v.name, v.layer, components, children);
        }, "name", "layer", "components", "children");
        addrec<Scene, (string, GameObject[])>(v => (v.name, v.GetRootGameObjects()), "name", "roots");
        addrec<Unlocker, (Reference, Reference, int, Reference[])>(v => {
            var group = prop(v, "group") as Unlocker[];
            var rs = new Reference[group == null ? 0 : group.Length];
            for(var i = 0; i < rs.Length; i++) {
                rs[i] = componentRef(group[i]);
            }

            return (
                componentRef(v.Target),
                componentRef(v.TargetBis),
                Convert.ToInt32(prop(v, "keyUse")),
                rs
            );
        }, "target", "targetBis", "keyUse", "group");
        addrec<UnlockerTrigger, (Reference, Reference, int)>(v => {
            return (
                componentRef(v.Target),
                componentRef(v.TargetBis),
                Convert.ToInt32(prop(v, "objectiveCleared"))
            );
        }, "target", "targetBis", "objectiveCleared");
        addrec<UnlockerTorch, (Reference, Reference, Reference, Reference[])>(v => {
            var group = prop(v, "torchGroup") as UnlockerTorch[];
            var rs = new Reference[group == null ? 0 : group.Length];
            for(var i = 0; i < rs.Length; i++) {
                rs[i] = componentRef(group[i]);
            }

            return (
                componentRef(v.Target),
                componentRef(v.TargetBis),
                componentRef(prop(v, "linkedTorch")),
                rs
            );
        }, "target", "targetBis", "linkedTorch", "group");
        addrec<Pickup, ValueTuple<Sprite>>(v => new(toSprite(tryAddSprite(v.Sprite))), "spriteI");
        addrec<KeyUnique, ValueTuple<int>>(v => new(Convert.ToInt32(v.KeyId)), "keyId");
        addrec<ModulePickup, ValueTuple<int>>(v => new(Convert.ToInt32(v.Id)), "moduleId");
        addrec<SkillPickup, ValueTuple<int>>(v => new(Convert.ToInt32(v.SkillId)), "skillId");
        addrec<StatsPickup, (int, int)>(v => (Convert.ToInt32(v.StatsId), (int)v.Level), "statsId", "level");
        addrec<Buyable, (int, bool, string, string, Reference)>(v => {
            var title = v.Title;
            if(title == null) title = "<None>";
            var desc = v.Desc;
            if(desc == null) desc = "<None>";
            return (v.Price, v.IsForSale, title, desc, componentRef(v.Owner));
        }, "price", "isForSale", "title", "description", "owner");
        addrec<Npc, (Sprite, int)>(
            v => (toSprite(tryAddSprite(v.GetComponentInChildren<SpriteRenderer>())), (int)v.Id),
            "spriteI", "id"
        );
        addrec<Tunnel, (Sprite, Reference)>(v => {
            return (toSprite(tryAddSprite(v.Sprite)), componentRef(v.Destination));
        }, "spriteI", "destination");
        addrec<Torch, ValueTuple<Sprite>>(v => new(toSprite(tryAddSprite(v.GetComponentInChildren<SpriteRenderer>()))), "spriteI");
        addrec<NpcTiny, ValueTuple<Sprite>>(v => new(toSprite(tryAddSprite(v.GetComponentInChildren<SpriteRenderer>()))), "spriteI");

        var scenes = new Scene[SceneManager.sceneCount];
        for(int i = 0; i < SceneManager.sceneCount; i++) {
            scenes[i] = SceneManager.GetSceneAt(i);
        }
        var result = serialized(scenes);
        var polygonsResult = serialized(colliderPolygons.ToArray());


        using(var schemasS = new StreamWriter(basePath + "schemas.js", false)) {
            {
                int yindex = -1, nindex = -1;
                foreach(var it in FindObjectsOfType<CrystalDestroyable>(true)) {
                    if((bool)prop(it, "dropXp")) {
                        if(yindex == -1) yindex = tryAddSprite(it.gameObject.GetComponentInChildren<SpriteRenderer>());
                    }
                    else {
                        if(nindex == -1) nindex = tryAddSprite(it.gameObject.GetComponentInChildren<SpriteRenderer>());
                    }
                    if(yindex != -1 && nindex != -1) break;
                }
                schemasS.WriteLine("export var crystalDestroyableTextures = [" + nindex + "," + yindex + "]");
            }
            {
                int index = -1;
                var it = FindObjectOfType<ScarabPickup>(true);
                if(it != null) index = tryAddSprite(it.gameObject.GetComponentNamed<SpriteRenderer>("FullImage", true));
                typeSerializers[typeof(ScarabPickup)].schema.textureIndex = index;
            }
            schemasS.WriteLine("export var xpForCrystalSize = [" + String.Join(", ", PlayerData.DestroyableCrystalValue) + "]");
            schemasS.WriteLine("export var texturesCount = " + texturesCount);

            schemasS.WriteLine("export var schemas = [");
            for(var i = 0; i < serializers.Count; i++) {
                var it = serializers[i].schema;
                var name = jsStr(it.itType.FullName);
                schemasS.Write("[" + it.type + "," + name + ",{");
                if(it.textureIndex != null) {
                    schemasS.Write("textureI:" + it.textureIndex + ",");
                }
                if(it.type == 1 && it.memberNames.Length > 0) {
                    schemasS.Write(
                        "members:[" + string.Join(',', it.memberNames.Select(t => jsStr(t))) + "],"
                        +"membersT:[" + string.Join(',', it.memberTypes.Select(t => getSchemaI(t))) + "],"
                    );
                }
                var bt = it.itType.BaseType;
                if(it.type == 1 && bt != null) {
                    schemasS.Write("base:" + getSchemaI(bt) + ",");
                }
                if(it.type == 2) {
                    schemasS.Write("elementT:" + getSchemaI(it.elementType) + ",");
                }
                schemasS.WriteLine("}],");
            }
            schemasS.WriteLine("]");

        }

        using (FileStream fs = new FileStream(basePath + "objects.bp", FileMode.Create, FileAccess.Write))
        using (BinaryWriter bw = new BinaryWriter(fs)) {
            writeDynamic(bw, result, anySerializer.index);
        }

        using (FileStream fs = new FileStream(basePath + "polygons.bp", FileMode.Create, FileAccess.Write))
        using (BinaryWriter bw = new BinaryWriter(fs)) {
            writeDynamic(bw, polygonsResult, anySerializer.index);
        }
    }
}
