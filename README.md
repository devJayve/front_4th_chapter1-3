## 과제 셀프회고

React에서 Hook을 개발함으로써 Vue, Angular와 같은 기존 SPA 프레임과는 전혀 다른 발전 궤도를 그리게 되었다고 합니다.(From 발제)
그만큼 Hook이 React에서 굉장히 중요한 개념이고  이를 얼마나 능숙하게 활용하느냐가 곧 React 개발자의 역량을 가늠하는 중요한 지표가 될 수 있겠다는 생각이 들었습니다.  

직접 개인 프로젝트에서 유명한 커스텀 훅 라이브러리인 React-hook-form를 사용해본 경험이 있는데 훅으로 인한 개발 생산성 향상을 직접 체감했습니다. 다만 메모이제이션을 활용한 최적화를 개념적으로만 이해하고 있을 뿐 **실제로 얼마나 성능이 개선되는지 수치적으로 평가하거나 눈으로 확인해본 경험이 아직 부족**했습니다. 이번 과제를 계기로 메모이제이션과 관련된 다양한 훅을 좀 더 깊이 학습하고 직접 구현해보며 이와 같은 성능 향상에 대한 부분을 더 구체적으로 이해해보겠다는 목표를 세웠습니다. 따라서 아래와 같이 기본적인 목표를 설정했습니다.

1. 각 훅의 동작 원리와 사용 방식을 명확하게 이해하고 구현
2. useMemo, useCallback 등 메모이제이션 관련 훅을 이용한 렌더링 최적화
3. 커스텀 훅을 이용한 유지보수성과 가독성 개선 

### React의 메모화(Memoization)
메모이제이션을 본격적으로 공부하기 전 `useMemo` 혹은 `useCallback` 훅을 사용하면 값을 캐싱해서 변하지 않았을 때 값의 불변을 유지한다는 개념으로 이해하고있었습니다.내부 동작을 제대로 알지 못하니 메모이제이션이 마치 최적화 마법처럼 느꼈습니다. 그래서 메모이제이션을 본격적으로 과제에 사용하기 앞서 리액트에서는 어떻게 구현했는지 살펴보고자 합니다.

먼저 리액트에는 훅을 실행하는 Dispatcher가 존재합니다. 이때 훅을 어떤 시점에서 실행하느냐에 따라 다른 Dispacher를 사용하는데요. 마운트 시점에서는 하단의 `HookDispatcherOnMount`를 사용합니다. 이때 useMemo의 경우 `mountMemo` 함수가 매칭됩니다.

```javascript
const HooksDispatcherOnMount: Dispatcher = {
    useCallback: mountCallback,
    useContext: readContext,
    useEffect: mountEffect,
    useMemo: mountMemo,
    useReducer: mountReducer,
    useRef: mountRef,
    useState: mountState,
    useMemoCache,
    // ... 생략 
};
```

다음은 `mountMemo`에서 핵심적인 부분에 대한 로직을 포함한 코드입니다. 마운트 시점인 만큼 새로 hook을 생성하여 Fiber에 연결합니다. (이때 연결하는 과정은 뒤이어 살펴보겠습니다.) 이후 정규화 및 상태 저장을 통해 이후 `updateMemo`에서 사용할 수 있도록 합니다.

```javascript
function mountMemo<T>(
    nextCreate: () => T, // 메모이제이션할 값을 생성하는 함수
    deps: Array<mixed> | void | null // 의존성 배열
): T {
    // 1. 새로운 hook을 생성하고 현재 Fiber에 연결
    const hook = mountWorkInProgressHook();

    // 2. deps 정규화 - undefined일 경우 null로 변경
    const nextDeps = deps === undefined ? null : deps;

    // 3. 값 생성
    const nextValue = nextCreate();

    // 4. 훅의 상태 저장
    hook.memoizedState = [nextValue, nextDeps];

    // 5. 계산된 값 반환
    return nextValue;
}
```

`mountWorkInProgressHook` 에서 어떻게 훅을 연결 생성하고 연결하는지 살펴보겠습니다. 먼저 몇 가지 값들로 구성된 hook 객체를 생성합니다. 이때 hook은 React 내부적으로 연결 리스트로 관리되고 있는데요. 그래서 아래와 같이 .next를 이용하여 연결리스트에 추가하는 방식을 확인할 수 있습니다.

```javascript
function mountWorkInProgressHook() {
    const hook: Hook = {
        memoizedState: null,
        baseState: null,
        baseQueue: null,
        queue: null,
        next: null,
    };

    if (workInProgressHook === null) {
        // 첫 번째 hook
        currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
    } else {
        // hook을 연결 리스트에 추가
        workInProgressHook = workInProgressHook.next = hook;
    }

    return workInProgressHook;
}
```

위에서는 의존성을 비교하는 것 없이 무조건 값을 생성하게 됩니다. 그럼 최적화는 어떻게 진행하는 걸까요? 예상한 바와 같이 `mountMemo`가 아닌 `updateMemo`에서 이루어지게 됩니다. 아래는 `updateMemo`의 핵심적인 부분입니다.
아마 이 코드가 과제와 유사해 익숙한 방식일 것 같습니다. 우리가 mount 시점에서 생성한 훅의 상태를 가져와 현재 의존성 배열과 비교하여 값의 재사용 여부를 결정하고 있습니다.
```javascript
function updateMemo<T>(
    nextCreate: () => T,
    deps: Array<mixed> | void | null
): T {
    // 1. 현재 작업 중인 훅을 가져옴
    const hook = updateWorkInProgressHook();

    // 2. 의존성 배열 정규화
    const nextDeps = deps === undefined ? null : deps;

    // 3. 이전 메모이제이션 상태 가져오기
    const prevState = hook.memoizedState;

    // 4. 의존성 배열 비교 후 같다면 이전 값 재사용 
    if (nextDeps !== null) {
        const prevDeps: Array<mixed> | null = prevState[1];
        if (areHookInputsEqual(nextDeps, prevDeps)) {
            return prevState[0];
        }
    }

    // 5. 의존성이 다르거나 없을 경우 새로운 값 계산
    const nextValue = nextCreate();

    hook.memoizedState = [nextValue, nextDeps];
    return nextValue;
}
```
정리하자면 React의 메모이제이션은 마법 같은 최적화가 아니라 이전 의존성 배열과 현재 의존성 배열이 동일한지 비교한 뒤 달라졌다면 새로 계산하고 아니면 이전 값을 재사용하는 방식입니다. 이제 이러한 메모이제이션 훅을 언제 활용하면 좋을지를 구체적으로 살펴보겠습니다.

### Memo는 언제 사용해야할까

메모이제이션 개념과 동작 방식, 그리고 복잡도가 높은 연산을 효율적으로 최적화할 수 있다는 점을 배웠다면 이제 실무에서 “언제” 메모이제이션을 적용해야 할지 고민이 생길 수 있습니다. 자료를 찾아보면 “필요하지 않은 경우에는 쓰지 않는 게 좋다”라는 의견과 “보이는 곳마다 써라”라는 의견이 엇갈리는 것 같습니다. 저 역시 전자에 가까웠지만 여기서는 제 기준으로 메모이제이션을 사용하면 좋은 상황과 그렇지 않은 상황을 정리해보려고 합니다.

#### Case 1) 복잡한 연산을 메모화해야하는 경우
아래 코드는 이번 과제에서 활용되었던 `filteredItems` 입니다. 해당 값은 items에서 검색 결과와 일치하는 item만을
팔터링하고 있습니다. filter의 경우 최악의 경우에 O(n)의 시간 복잡도를 가집니다. 여기서 가격을 오름차순으로 정렬까지 한다고 가정해보겠습니다.

```javascript
const filteredItems = () => {
    return items.filter(
        (item) =>
            item.name.toLowerCase().includes(filter.toLowerCase()) ||
            item.category.toLowerCase().includes(filter.toLowerCase()),
    );
};
```

정렬의 경우 최악의 경우에 O(n log n)이 소요됩니다. (필터링된 아이템을 m이라고 했을 때 엄밀히 말하면 O(m log m)이지만 필터링이 거의 없는 경우를 가정하겠습니다.) useMemo를 사용하지 않으면 상태가 업데이트됨에 따라 매우 불필요하게 이러한 복잡한 계산을 다시 수행해야합니다. 예를 들어 아이템이 1,000,000개가 포함된 경우 정렬 기준 1,000,000 * log(1,000,000) = 6,000,000의 연산이 필요합니다.
```javascript
const filteredItems = () => {
    return items
        .filter(
            (item) =>
                item.name.toLowerCase().includes(filter.toLowerCase()) ||
                item.category.toLowerCase().includes(filter.toLowerCase()),
        )
        .sort((a, b) => {
            return a.price - b.price;
        });
};
```
상태가 업데이트될 때마다 이 함수를 매번 다시 실행한다면 특히 아이템이 수백만 개에 달하는 상황에서 불필요한 연산이 계속 반복됩니다.  useMemo를 적용하면 items나 filter 값이 바뀌지 않는 한 필터와 정렬을 재실행하지 않으므로 충분히 유의미한 퍼포먼스 향상을 기대할 수 있습니다.
```javascript
const filteredItems = useMemo(() => {
    return items
        .filter(
            (item) =>
                item.name.toLowerCase().includes(filter.toLowerCase()) ||
                item.category.toLowerCase().includes(filter.toLowerCase()),
        )
        .sort((a, b) => {
            return a.price - b.price;
        });
}, [items, filter]);
```

#### Case 2) 메모이제이션이 불필요한 경우
하지만 모든 상황에 메모이제이션이 이득이 되지 않습니다.  예를 들어, 스칼라 값(문자열, 숫자, 불리언 등)은 메모화할 필요가 없는 경우가 많습니다.  자바스크립트에서 스칼라 값은 참조(reference)가 아닌 실제 값(value)으로 비교되므로 다음과 같이 단순한 배수 연산 정도라면 useMemo 대신 그냥 바로 계산해도 큰 문제가 없습니다. 오히려 useMemo가 불필요한 메모리를 사용하게 됩니다.
```javascript
const [count, setCount] = useState(0);
const doubleCount = useMemo(() => {
    return count * 2;
}, [count]);
```
비슷한 논리로 모든 함수에 `useCallback`또한 불필요하게 적용되는 경우가 존재합니다. 아래 예시처럼 onclick 핸들러인 increment를 useCallback을 통해 메모화 하면서 얼핏보면 렌더링 최적화를 이룬 것처럼 보이지만 `button`의 경우 **브라우저 네이티브 엘리먼트이고 호출 가능한 리액트 함수 컴포넌트가 아니기 때문에 increment를 메모화해서 얻는 이점이 거의 없습니다.** 해당 버튼 엘리먼트는 리액트 컴포넌트처럼 서브 트리가 존재 않아 재생성 비용이 큰 이슈가 아닙니다.
```javascript
const increment = useCallback(() => { // count 증가 함수 메모화
    setCount((prev) => prev + 1);
}, []);
// ... 생략
return (
    <button onClick={increment}>Click me</button>
);
```

### 메모이제이션의 오해와 진실
그렇다면 메모이제이션은 복잡한 계산에만 즉, 정말 필요한 상황에서만 활용하면 될까요? 정해진 정답은 없지만 저는 [8팀 멘토링 시간](https://www.notion.so/teamsparta/8-ecef2b4544d44b02b6d4b4c8ae023ee0?pvs=4)에 해답을 얻었습니다. (준일 코치님 감사합니다!!) 메모이제이션을 꼭 필요한 상황에만 사용한다면 좋겠지만 정확한 사용처를 판단하는 데 드는 비용과 팀 내부의 커뮤니케이션 비용을 절대 무시할 수 없습니다. 게다가 **정작 필요한 순간에 최적화를 놓쳐서 병목 현상이 발생**할 가능성도 있습니다.

위에서 언급한 "정작 필요한 순간"에 대해 살펴보겠습니다. 먼저 하단과 같이 매우 복잡한 계산을 하는 테스트 컴포넌트가 있다고 가정해보겠습니다.
```javascript
const TestComponent = (props: ComponentProps<"div">) => {
  // 복잡한 컴포넌트라고 가정을 해볼게요.
  return <div {...props}>복잡한 컴포넌트라고 가정을 해볼게요.</div>;
};
```

아래와 같이 부모 컴포넌트에서 테스트 컴포넌트를 호출하고자 합니다. 이때 테스트 컴포넌트는 계산 비용이 너무 많이 드는걸 인지했으니 리렌더링을 방지하고자 테스트 컴포넌트에만 부분적으로 memo HOC를 적용해보겠습니다.
```javascript
function ParentComponent({
  style: defaultStyle,
  onClick,
  onMouseEnter,
}: {
  style: Record<string, any>;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const handleClick = () => {
    console.log("ParentComponent1에서 실행하는 handleClick");
    onClick();
  };

  const handleMouseEnter = () => {
    console.log("ParentComponent1에서 실행하는 handleMouseEnter");
    onMouseEnter();
  };

  const style = { backgroundColor: "#f5f5f5", ...defaultStyle }

  return (
    <div>
      <TestComponent className="a b c" id="test" style={style} />
      <TestComponent id="test2" onClick={handleClick} />
      <TestComponent id="test3" onMouseEnter={handleMouseEnter} />
      <TestComponent id="test4" title="타이틀입니다." />
    </div>
  );
}
```

아래와 같이 `memo`를 씌운 뒤 리렌더링이 방지될까요? **그렇지 않습니다.** memo를 씌워도 Parent1에서 전달되는
props가 항상 새로운 값이기 때문에 리렌더링이 발생합니다. 따라서 ParentComponent에서도 useMemo와 useCallback으로 메모이제이션을 해야합니다.
```javascript
const TestComponent = memo((props: ComponentProps<"div">) => {
  // 복잡한 컴포넌트라고 가정을 해볼게요.
  return <div {...props}>복잡한 컴포넌트라고 가정을 해볼게요.</div>;
});
```

ParentComponent 내부에 `handleClick`, `handleMouseEnter`, `style`에 메모이제이션을 적용했습니다. 이제 정말
리렌더링을 방지할 수 있을 것 같습니다. 그러나 ParentComponent가 Props를 받는 것을 보아 ParentComponent를 호출하는 컴포넌트가 존재할 것으로 보입니다. 해당 컴포넌트를 GrandComponent라 지칭하겠습니다.
```javascript
 const handleClick = useCallback(() => {
    console.log("ParentComponent1에서 실행하는 handleClick");
    onClick();
  }, [onClick]);

  const handleMouseEnter = useCallback(() => {
    console.log("ParentComponent1에서 실행하는 handleMouseEnter");
    onMouseEnter();
  }, [onMouseEnter]);

  const style = useMemo(
    () => ({ backgroundColor: "#f5f5f5", ...defaultStyle }),
    [defaultStyle],
  );
```
TestComponent 리렌더링을 방지하기 위해선 GrandParentComponent에서도 메모이제이션을 적용해야합니다. 
정말 리렌더링을 철저히 막고 싶다면 이와 같이 체인으로 연결된 모든 곳에서 메모이제이션을 해야 하는 경우가 생길 수 있습니다. 따라서 그냥 **일관성있게 모두 메모이제이션을 적용하면 이런 고민과 커뮤니케이션 비용을 아낄 수 있습니다.**
```javascript
function GrandComponent() {
    const style = useMemo(() => ({ color: "#09F" }), []);
    const handleClick = useCallback(() => null, []);
    const handleMouseEnter = useCallback(() => null, []);

    return (
        <ParentComponent
            style={style}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
        />
    );
}
```
따라서 우리가 일관성있게 메모이제이션을 적용해야하는 이유를 수식으로 아래와 같이 표현해볼 수 있을 것 같습니다.
> (메모리에 대한 추가 부담) < (놓친 최적화로 인한 비용 + 커뮤니케이션 비용)
