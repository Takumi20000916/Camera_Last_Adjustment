import { ObjectDetector, FilesetResolver } from "./vision_bundle.js";
var objectDetector;
let runningMode = "IMAGE";

// モデルの切り替えを行う関数
let modelSwitching = false;

async function switchModel(modelPath) {
    modelSwitching = true;  // モデル切り替え中フラグを設定
    console.log("Switching model to:", modelPath);
    try {
        // モデルの準備
        const vision = await FilesetResolver.forVisionTasks("./wasm");
        // 新しい物体検出器を作成
        const newObjectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: modelPath,
                delegate: "GPU"
            },
            scoreThreshold: 0.35,
            runningMode: runningMode
        });
        // 古い物体検出器をnullに設定し、新しい物体検出器に置き換える
        if (objectDetector) {
            objectDetector = null;
        }
        objectDetector = newObjectDetector;
        currentModel = modelPath;  // 現在のモデルを更新
        console.log("Model switched successfully to:", modelPath);
    } catch (error) {
        console.error("Failed to switch model:", error);
    } finally {
        modelSwitching = false;  // モデル切り替え中フラグをリセット
    }
}

// 初期化関数
const initializeObjectDetector = async () => {
    await switchModel('./models/hanyou.tflite');
     // カメラを有効にする
     enableCam();
     // ローディングインジケーターを非表示にする
     document.querySelector('#loading').style.display = 'none';
};

// ページロード時に初期化関数を呼び出す
// window.addEventListener("load", () => {
//     initializeObjectDetector();
// });
initializeObjectDetector();

/********************************************************************
// Demo 2: Continuously grab image from webcam stream and detect it.
********************************************************************/
let video = document.getElementById("webcam");
let enableWebcamButton;

function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

var children = [];

async function enableCam(event) {
    if (!objectDetector) {
        console.log("Wait! objectDetector not loaded yet.");
        return;
    }

    // localStorageに保存されたcameraIdがあれば、それを使用
    const cameraId = localStorage.getItem('cameraId');

    // const constraints = {
    //     video: {
    //         deviceId: cameraId,
    //         facingMode: 'environment',
    //         aspectRatio: { ideal: 1.0 }, // アスペクト比の理想値
    //         // width: { ideal: 400 }, // 幅を設定
    //         // height: { ideal: 800 } // 高さを設定
    //         advanced: [
    //             { zoom: 0.5 },  // 広角のためにズームを指定
    //             { focusMode: "continuous"}  // 焦点距離を指定
    //           ]
    //     }
    // };
    const constraints = {
        video: {
            deviceId: cameraId,
            facingMode: 'environment',
            width: { max: 1920 },
            height: { max: 1080 },
            aspectRatio: { ideal: 1.0 }
        }
    };

      // ウェブカムストリームを有効にする
    navigator.mediaDevices
        .getUserMedia(constraints)
        .then(function (stream) {
            video.srcObject = stream;
            window.currentStream = stream;

            // ストリームの詳細情報を取得
            let videoTrack = stream.getVideoTracks()[0];
            let settings = videoTrack.getSettings();
            let capabilities = videoTrack.getCapabilities();


            video.addEventListener("loadeddata", predictWebcam);
        })
        .catch((err) => {
            console.error(err);
        });
}



let lastVideoTime = -1;
async function predictWebcam() {
    // 初回の実行モードが"IMAGE"の場合、ビデオの実行モードで新しい分類器を作成
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await objectDetector.setOptions({ runningMode: "VIDEO" });
    }

    let nowInMs = Date.now();

     // detectForVideoを使ってオブジェクトを検出
    if (video.currentTime !== lastVideoTime && !modelSwitching) {
        lastVideoTime = video.currentTime;
        const detections = await objectDetector.detectForVideo(video, nowInMs);

        // 検出結果を取得
        gotDetections(detections);
        handleGestures();
    }//ここにフラグたてて、モデル切り替え中は検出しないようにする

    // ブラウザが準備ができたら再度この関数を呼び出して予測を継続
    window.requestAnimationFrame(predictWebcam);
}

// 信頼度のしきい値を変更するイベントリスナー
document.querySelector('#input_confidence_threshold').addEventListener('change', changedConfidenceThreshold);

// 信頼度のしきい値を変更する関数
function changedConfidenceThreshold(e) {
    let confidenceThreshold = parseFloat(e.srcElement.value);
    objectDetector.setOptions({
        // しきい値をfloatにキャスト
        scoreThreshold: confidenceThreshold
    });

    document.querySelector('#confidence_threshold').innerHTML = e.srcElement.value;
}

// カメラのリストを取得する関数
async function listCameras() {
    try {
        const selectCamera = document.getElementById('select_camera');
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                console.log(devices);
                devices.forEach(device => {
                    if (device.kind === 'videoinput') {
                        const option = document.createElement('option');
                        option.text = device.label || `camera ${selectCamera.length + 1}`;
                        option.value = device.deviceId;
                        
                        // localStorageに保存されたcameraIdがあれば、それを選択状態にする
                        const cameraId = localStorage.getItem('cameraId');
                        if (cameraId === device.deviceId) {
                            option.selected = true;
                        }
                        selectCamera.appendChild(option);
                    }
                });
            });
    } catch (err) {
        console.error('メディアデバイスへのアクセス中にエラーが発生しました。', err);
    }
}
await listCameras();

// カメラのリフレッシュボタンを押した時のイベントリスナー
document.querySelector('#button_refresh_camera').addEventListener('click', async () => {
    try {
        // 仮のカメラアクセスをリクエストしてユーザーの許可を取得
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
        document.querySelector('#select_camera').innerHTML = '';
        await listCameras();

        if (initialStream) {
            initialStream.getTracks().forEach(track => track.stop());
        }
    } catch (err) {
        console.error('メディアデバイスへのアクセス中にエラーが発生しました。', err);
    }
})

// カメラ選択が変更された時のイベントリスナー
document.getElementById('select_camera').addEventListener('change', changedCamera);
function changedCamera() {
    const selectCamera = document.getElementById('select_camera');
    const constraints = {
        video: {
            deviceId: selectCamera.value,
            facingMode: 'environment',
            width: { max: 1920 },
            height: { max: 1080 },
            aspectRatio: { ideal: 1.0 }
        }
    };

    // 選択されたカメラIDをlocalStorageに保存
    localStorage.setItem('cameraId', selectCamera.value);

    navigator.mediaDevices
        .getUserMedia(constraints)
        .then(function (stream) {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        })
        .catch((err) => {
            console.error(err);
        });
}




// ジェスチャー検出結果を処理する関数
let currentModel = './models/hanyou.tflite'; // 現在のモデルを保持

function handleGestures() {
    if (gestures_results) {
        for (let i = 0; i < gestures_results.gestures.length; i++) {
            let name = gestures_results.gestures[i][0].categoryName;  // ジェスチャーのカテゴリ名 
            if (name === "Pointing_Up" && currentModel !== './models/hanyou.tflite') {
                console.log(`Gesture: ${name} detected. Switching model to hanyou.`);
                switchModel('./models/hanyou.tflite');
            } else if (name === "Victory" && currentModel !== './models/mickey.tflite') {
                console.log(`Gesture: ${name} detected. Switching model to mickey.`);
                switchModel('./models/mickey.tflite');
            } else if (name === "THREE" && currentModel !== './models/tempereture.tflite') {
                console.log(`Gesture: ${name} detected. Switching model to tempereture.`);
                switchModel('./models/tempereture.tflite');
            } else if (name === "FOUR" && currentModel !== './models/container3.tflite') {
                console.log(`Gesture: ${name} detected. Switching model to container3.`);
                switchModel('./models/container3.tflite');
            }
        }
    }
}