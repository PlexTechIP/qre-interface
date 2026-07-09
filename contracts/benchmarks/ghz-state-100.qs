/// GHZ state preparation source retained as a tiny Q# upload smoke-test
/// sample. It is not part of the starter benchmark list in
/// contracts/benchmarks.json.
import Std.Measurement.*;

operation Main() : Result[] {
    use qs = Qubit[100];
    H(qs[0]);
    for i in 1..Length(qs) - 1 {
        CNOT(qs[i - 1], qs[i]);
    }
    MResetEachZ(qs)
}
